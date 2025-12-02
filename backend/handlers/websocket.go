package handlers

import (
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

const (
	// 永続化ファイルのパス
	persistenceFile = "ydoc_state.bin"
	// 自動保存の間隔（秒）
	autoSaveInterval = 30
)

// 接続中のクライアント管理
type client struct {
	conn *websocket.Conn
	send chan []byte
}

var (
	// 接続中のクライアント
	clients      = make(map[*client]bool)
	clientsMutex sync.RWMutex

	// 共有状態（簡易版：実際にはYDocのバイナリデータを保持）
	sharedState []byte
	stateMutex  sync.RWMutex
)

func init() {
	// サーバー起動時に保存された状態を読み込む
	loadState()

	// 自動保存を開始
	go autoSave()
}

// HandleWebSocket WebSocketハンドラー
// Yjsのsync protocolメッセージを転送
func HandleWebSocket(c echo.Context) error {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			// 開発環境ではすべてのオリジンを許可
			return true
		},
	}
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	roomName := c.Param("room")
	log.Printf("WebSocket client connected: %s (room: %s)", c.RealIP(), roomName)

	client := &client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	clientsMutex.Lock()
	clients[client] = true
	clientsMutex.Unlock()

	// 送信ループ
	go client.writePump()

	// 受信ループ
	client.readPump()

	// クリーンアップ
	clientsMutex.Lock()
	delete(clients, client)
	clientsMutex.Unlock()
	close(client.send)

	log.Println("WebSocket client disconnected")
	return nil
}

// readPump メッセージ受信ループ
func (c *client) readPump() {
	defer c.conn.Close()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if err == io.EOF {
				log.Println("WebSocket read EOF")
			} else {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}

		// Yjsメッセージを処理
		if err := c.handleMessage(message); err != nil {
			log.Printf("Error handling message: %v", err)
			break
		}
	}
}

// writePump メッセージ送信ループ
func (c *client) writePump() {
	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
			log.Printf("WebSocket write error: %v", err)
			return
		}
	}
	c.conn.WriteMessage(websocket.CloseMessage, nil)
}

// handleMessage Yjsメッセージを処理
// y-websocketはYjsのsync protocolメッセージをそのまま送信するため、
// メッセージをそのまま転送する必要があります
func (c *client) handleMessage(msg []byte) error {
	if len(msg) == 0 {
		return nil
	}

	// デバッグ用：メッセージタイプをログ出力
	if len(msg) > 0 {
		msgType := msg[0]
		log.Printf("Received message type: %d, length: %d", msgType, len(msg))
	}

	// Updateメッセージ（タイプ2）の場合は状態を保存
	if len(msg) > 0 && msg[0] == 2 {
		c.handleUpdate(msg)
	}

	// y-websocketは、Yjsのsync protocolメッセージをそのまま送信するため、
	// メッセージをそのまま全クライアントにブロードキャスト
	return c.broadcastMessage(msg)
}

// handleUpdate Updateメッセージ（タイプ2）を処理して状態を保存
func (c *client) handleUpdate(msg []byte) {
	if len(msg) < 2 || msg[0] != 2 {
		return
	}

	update := msg[1:]
	if len(update) == 0 {
		return
	}

	// 共有状態を更新
	stateMutex.Lock()
	sharedState = update
	stateMutex.Unlock()

	// YDocの内容を解析してログ出力（簡易版）
	c.logYDocContent(update)

	// 状態を保存（非同期）
	go saveState()
}

// broadcastMessage 全クライアントにメッセージをブロードキャスト
func (c *client) broadcastMessage(msg []byte) error {
	clientsMutex.RLock()
	defer clientsMutex.RUnlock()

	for client := range clients {
		if client != c {
			select {
			case client.send <- msg:
			default:
				// 送信バッファが満杯の場合はスキップ
			}
		}
	}
	return nil
}

// logYDocContent YDocの内容をログ出力とバリデーション
// 実際の実装では、y-crdtライブラリを使用してYDocを解析
func (c *client) logYDocContent(update []byte) {
	// バリデーション：更新サイズのチェック
	const maxUpdateSize = 10 * 1024 * 1024 // 10MB制限
	if len(update) > maxUpdateSize {
		log.Printf("WARNING: Update size exceeds limit: %d bytes (max: %d)", len(update), maxUpdateSize)
		return
	}

	log.Printf("Received YDoc update: %d bytes", len(update))

	// 簡易版：バイナリデータの一部をログ出力（デバッグ用）
	if len(update) > 0 {
		previewLen := min(100, len(update))
		log.Printf("Update preview (first %d bytes): %x", previewLen, update[:previewLen])

		// 簡易的なサイズベースの推定（実際のノード/エッジ数ではない）
		// 1つのノードが約100-500バイト、1つのエッジが約50-200バイトと仮定
		estimatedNodes := len(update) / 300
		estimatedEdges := len(update) / 100
		log.Printf("Estimated nodes: ~%d, Estimated edges: ~%d (rough estimate)", estimatedNodes, estimatedEdges)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// saveState 共有状態をファイルに保存
func saveState() {
	stateMutex.RLock()
	data := sharedState
	stateMutex.RUnlock()

	if len(data) == 0 {
		return
	}

	// ファイルに書き込み
	if err := os.WriteFile(persistenceFile, data, 0644); err != nil {
		log.Printf("Error saving state: %v", err)
		return
	}

	log.Printf("State saved to %s (%d bytes)", persistenceFile, len(data))
}

// loadState 保存された状態をファイルから読み込む
func loadState() {
	data, err := os.ReadFile(persistenceFile)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("No saved state found, starting with empty state")
			return
		}
		log.Printf("Error loading state: %v", err)
		return
	}

	if len(data) == 0 {
		log.Println("Saved state is empty")
		return
	}

	stateMutex.Lock()
	sharedState = data
	stateMutex.Unlock()

	log.Printf("State loaded from %s (%d bytes)", persistenceFile, len(data))
}

// autoSave 定期的に状態を自動保存
func autoSave() {
	ticker := time.NewTicker(autoSaveInterval * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		stateMutex.RLock()
		hasState := len(sharedState) > 0
		stateMutex.RUnlock()

		if hasState {
			saveState()
		}
	}
}
