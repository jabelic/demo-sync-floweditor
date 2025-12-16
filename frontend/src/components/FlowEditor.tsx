import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  Node,
  Edge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  Connection,
  EdgeChange,
  MarkerType,
  NodeChange,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import * as Y from "yjs";
import { useYjs } from "../hooks/useYjs";
import { useYMapSnapshot } from "../hooks/useYMapSnapshot";

// Awareness情報の型定義
interface AwarenessState {
  cursor?: {
    x: number;
    y: number;
  };
  user?: {
    name: string;
    color: string;
  };
}

function syncListToYMap<T extends { id: string }>(
  ydoc: Y.Doc,
  ymap: Y.Map<T>,
  prev: T[],
  next: T[]
) {
  ydoc.transact(() => {
    const nextIds = new Set(next.map((n) => n.id));
    for (const id of prev.map((n) => n.id)) {
      if (!nextIds.has(id)) ymap.delete(id);
    }
    for (const item of next) {
      ymap.set(item.id, item);
    }
  });
}

// React FlowのノードとエッジはYjsを唯一のソースにする
export default function FlowEditor() {
  const { ydoc, provider } = useYjs();

  // Yjsの共有マップ（id -> Node/Edge）
  const nodesById = useMemo(() => ydoc.getMap<Node>("nodesById"), [ydoc]);
  const edgesById = useMemo(() => ydoc.getMap<Edge>("edgesById"), [ydoc]);

  // Yjsの変更を購読して描画へ反映（React stateにミラーしない）
  const nodesByIdSnapshot = useYMapSnapshot(nodesById);
  const edgesByIdSnapshot = useYMapSnapshot(edgesById);
  const nodes = useMemo(
    () => Array.from(nodesByIdSnapshot.values()),
    [nodesByIdSnapshot]
  );
  const edges = useMemo(
    () => Array.from(edgesByIdSnapshot.values()),
    [edgesByIdSnapshot]
  );

  useEffect(() => {
    // 外部: 共有Yjsドキュメント（外部ストア）のスキーマ移行を行う
    const legacyNodes = ydoc.getArray<Node>("nodes");
    const legacyEdges = ydoc.getArray<Edge>("edges");

    if (nodesById.size === 0 && legacyNodes.length > 0) {
      ydoc.transact(() => {
        for (const node of legacyNodes.toArray()) nodesById.set(node.id, node);
        legacyNodes.delete(0, legacyNodes.length);
      });
    }

    if (edgesById.size === 0 && legacyEdges.length > 0) {
      ydoc.transact(() => {
        for (const edge of legacyEdges.toArray()) edgesById.set(edge.id, edge);
        legacyEdges.delete(0, legacyEdges.length);
      });
    }
  }, [ydoc, nodesById, edgesById]);

  // React Flowインスタンス（座標変換に使用）
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [hasReactFlowInstance, setHasReactFlowInstance] = useState(false);

  // ビューポート変化で他ユーザーのカーソル再計算を促す
  const [viewportVersion, setViewportVersion] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Awareness状態（他ユーザーの情報）
  const [awarenessStates, setAwarenessStates] = useState<
    Map<number, AwarenessState>
  >(new Map());

  // 現在のユーザー情報
  const currentUser = useMemo(() => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
    const names = [
      "ユーザー1",
      "ユーザー2",
      "ユーザー3",
      "ユーザー4",
      "ユーザー5",
    ];
    const index = Math.floor(Math.random() * colors.length);
    return {
      name: names[index],
      color: colors[index],
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      syncListToYMap(ydoc, nodesById, nodes, nextNodes);
    },
    [ydoc, nodesById, nodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      syncListToYMap(ydoc, edgesById, edges, nextEdges);
    },
    [ydoc, edgesById, edges]
  );

  // Awareness機能の設定
  useEffect(() => {
    // 外部: Yjs Awarenessとwindow mousemoveに同期する
    // 現在のユーザー情報を設定
    provider.awareness.setLocalStateField("user", currentUser);

    // マウス移動時にカーソル位置を更新
    const handleMouseMove = (event: MouseEvent) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) return;

      const position = instance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      provider.awareness.setLocalStateField("cursor", {
        x: position.x,
        y: position.y,
      });
    };

    // 他ユーザーのAwareness状態の変更を監視
    const handleAwarenessChange = () => {
      const states = new Map<number, AwarenessState>();
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== provider.awareness.clientID) {
          states.set(clientId, state as AwarenessState);
        }
      });
      setAwarenessStates(states);
    };

    window.addEventListener("mousemove", handleMouseMove);
    provider.awareness.on("change", handleAwarenessChange);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      provider.awareness.off("change", handleAwarenessChange);
      provider.awareness.setLocalStateField("cursor", null);
    };
  }, [provider, currentUser]);

  useEffect(() => {
    // 外部: requestAnimationFrame を使用しているのでアンマウント時にキャンセルする
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // エッジ接続時のハンドラー
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        source: params.source ?? "",
        target: params.target ?? "",
        id: `edge-${Date.now()}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      };
      // 追加はid単位で反映する（配列全置換しない）
      ydoc.transact(() => {
        edgesById.set(newEdge.id, newEdge);
      });
    },
    [ydoc, edgesById]
  );

  // ノード追加のヘルパー関数
  const addNode = useCallback(() => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: "default",
      position: {
        x: Math.random() * 400,
        y: Math.random() * 400,
      },
      data: {
        label: `Node ${nodes.length + 1}`,
      },
    };
    ydoc.transact(() => {
      nodesById.set(newNode.id, newNode);
    });
  }, [nodes.length, ydoc, nodesById]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance;
    setHasReactFlowInstance(true);
  }, []);

  const onMove = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setViewportVersion((v) => v + 1);
    });
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 10,
          background: "white",
          padding: "10px",
          borderRadius: "5px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <button
          onClick={addNode}
          style={{
            padding: "8px 16px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          ノードを追加
        </button>
        <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
          ノード数: {nodes.length} | エッジ数: {edges.length}
        </div>
      </div>
      {/* 他ユーザーのカーソルを表示 */}
      {Array.from(awarenessStates.entries()).map(([clientId, state]) => {
        void viewportVersion;
        if (!state.cursor || !hasReactFlowInstance) return null;
        const instance = reactFlowInstanceRef.current;
        if (!instance) return null;

        const position = instance.flowToScreenPosition({
          x: state.cursor.x,
          y: state.cursor.y,
        });

        return (
          <div
            key={clientId}
            style={{
              position: "absolute",
              left: position.x,
              top: position.y,
              pointerEvents: "none",
              zIndex: 1000,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: state.user?.color || "#007bff",
                border: "2px solid white",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            />
            {state.user?.name && (
              <div
                style={{
                  position: "absolute",
                  top: "25px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: state.user.color || "#007bff",
                  color: "white",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontSize: "10px",
                  whiteSpace: "nowrap",
                }}
              >
                {state.user.name}
              </div>
            )}
          </div>
        );
      })}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onMove={onMove}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
