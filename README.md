# React Flow Yjs リアルタイムコラボレーションエディタ

Go/EchoバックエンドとReact/TypeScriptフロントエンドで、y-crdt(Go)とYjs(TypeScript)を使ったリアルタイムコラボレーション編集機能を実装したデモアプリケーションです。

## 技術スタック

### バックエンド
- Go 1.21+
- Echo v4
- WebSocket

### フロントエンド
- React + TypeScript
- Vite
- Yjs
- y-websocket
- React Flow

## 機能

1. **リアルタイム同期されるフローチャートエディタ**
   - React Flowでノードとエッジを配置・編集
   - 複数ユーザーが同時編集可能
   - 各ユーザーのカーソル位置を表示（Awareness機能）

2. **バックエンド側のCRDT理解**
   - EchoサーバーがYDocの内容を読み取り可能
   - サーバー側でノード数やエッジ数をログ出力
   - 簡単なバリデーション（更新サイズの上限チェック）

3. **永続化**
   - YDocの状態をファイルに保存
   - サーバー再起動時に自動復元
   - 30秒ごとの自動保存

## セットアップ

### バックエンド

```bash
cd backend
go mod download
go run main.go
```

サーバーは `http://localhost:8080` で起動します。

### フロントエンド

```bash
cd frontend
pnpm install
pnpm dev
```

フロントエンドは `http://localhost:3000` で起動します。

## 使い方

1. ブラウザで `http://localhost:3000` を開く
2. 複数のブラウザタブまたはウィンドウで同じURLを開く（複数ユーザーをシミュレート）
3. 「ノードを追加」ボタンでノードを追加
4. ノードをドラッグして移動
5. ノード間をドラッグしてエッジ（接続）を作成
6. 他のタブ/ウィンドウでリアルタイムに変更が反映されることを確認
7. 他ユーザーのカーソル位置が色付きの円で表示されることを確認

## ディレクトリ構成

```
reactflow-yjs/
├── backend/
│   ├── main.go              # Echoサーバーのエントリーポイント
│   ├── handlers/
│   │   └── websocket.go     # WebSocketハンドラー（Yjs sync protocol処理）
│   ├── go.mod
│   └── ydoc_state.bin       # 永続化されたYDoc状態（自動生成）
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   └── FlowEditor.tsx  # React Flowエディタコンポーネント
│   │   └── hooks/
│   │       └── useYjs.ts        # Yjsフック
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## 実装のポイント

### Yjs Sync Protocol

バックエンドはYjsのsync protocolを実装しています：
- **Sync step 1 (0)**: クライアントが初期同期を要求
- **Sync step 2 (1)**: サーバーが状態ベクターを送信
- **Update (2)**: クライアント/サーバーが変更を送信

### Awareness機能

YjsのAwareness機能を使用して、他ユーザーのカーソル位置とユーザー情報を共有しています。

### 永続化

YDocのバイナリ状態を `ydoc_state.bin` ファイルに保存し、サーバー起動時に自動的に読み込みます。

## 注意事項

- 現在の実装では、サーバー側でのYDocの完全な解析にはy-crdtライブラリが必要です
- 実際のy-crdtライブラリを統合する場合は、`handlers/websocket.go` の `logYDocContent` 関数を更新してください
- 本実装はデモ用途であり、本番環境で使用する場合は追加のセキュリティ対策が必要です

## ライセンス

MIT


