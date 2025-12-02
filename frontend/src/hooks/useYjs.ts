import { useEffect, useMemo } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// Yjsドキュメントとプロバイダーを管理するフック
export function useYjs(roomName: string = "reactflow-room") {
  // YDocをメモ化（再作成を防ぐ）
  const ydoc = useMemo(() => new Y.Doc(), []);

  // WebSocketプロバイダーをメモ化
  const provider = useMemo(() => {
    const wsProvider = new WebsocketProvider(
      "ws://localhost:8080/ws",
      roomName,
      ydoc
    );

    // 接続状態のログ
    wsProvider.on("status", (event: { status: string }) => {
      console.log("Yjs connection status:", event.status);
    });

    return wsProvider;
  }, [ydoc, roomName]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      provider.destroy();
      // ydocはproviderが管理するので、ここではdestroyしない
    };
  }, [provider]);

  return { ydoc, provider };
}
