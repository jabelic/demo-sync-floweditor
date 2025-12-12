import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Connection,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import * as Y from "yjs";
import { useYjs } from "../hooks/useYjs";

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

// React FlowのノードとエッジをYjsのY.Arrayに同期
export default function FlowEditor() {
  const { ydoc, provider } = useYjs();

  // Yjsの共有配列を取得
  const nodesArray = useMemo(() => ydoc.getArray<Node>("nodes"), [ydoc]);
  const edgesArray = useMemo(() => ydoc.getArray<Edge>("edges"), [ydoc]);

  // React Flowの状態
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

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

  // YjsからReact Flowへの同期
  useEffect(() => {
    // 初期状態を設定
    const initialNodes = nodesArray.toArray();
    const initialEdges = edgesArray.toArray();
    setNodes(initialNodes);
    setEdges(initialEdges);

    // Yjsの変更を監視
    const handleNodesChange = () => {
      const newNodes = nodesArray.toArray();
      setNodes(newNodes);
    };

    const handleEdgesChange = () => {
      const newEdges = edgesArray.toArray();
      setEdges(newEdges);
    };

    nodesArray.observe(handleNodesChange);
    edgesArray.observe(handleEdgesChange);

    return () => {
      nodesArray.unobserve(handleNodesChange);
      edgesArray.unobserve(handleEdgesChange);
    };
  }, [nodesArray, edgesArray, setNodes, setEdges]);

  // React FlowからYjsへの同期（ノード変更時）
  useEffect(() => {
    // Yjsの配列を更新
    const yjsNodes = nodesArray.toArray();
    const nodesEqual =
      yjsNodes.length === nodes.length &&
      yjsNodes.every(
        (node, i) =>
          node.id === nodes[i]?.id &&
          node.position.x === nodes[i]?.position.x &&
          node.position.y === nodes[i]?.position.y
      );

    if (!nodesEqual) {
      nodesArray.delete(0, nodesArray.length);
      nodesArray.insert(0, nodes);
    }
  }, [nodes, nodesArray]);

  // React FlowからYjsへの同期（エッジ変更時）
  useEffect(() => {
    // Yjsの配列を更新
    const yjsEdges = edgesArray.toArray();
    const edgesEqual =
      yjsEdges.length === edges.length &&
      yjsEdges.every((edge, i) => edge.id === edges[i]?.id);

    if (!edgesEqual) {
      edgesArray.delete(0, edgesArray.length);
      edgesArray.insert(0, edges);
    }
  }, [edges, edgesArray]);

  // Awareness機能の設定
  useEffect(() => {
    // 現在のユーザー情報を設定
    provider.awareness.setLocalStateField("user", currentUser);

    // マウス移動時にカーソル位置を更新
    const handleMouseMove = (event: MouseEvent) => {
      if (!reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
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
  }, [provider, reactFlowInstance, currentUser]);

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
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
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
    setNodes((nds) => [...nds, newNode]);
  }, [nodes.length, setNodes]);

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
        if (!state.cursor || !reactFlowInstance) return null;

        const position = reactFlowInstance.flowToScreenPosition({
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
        onInit={setReactFlowInstance}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
