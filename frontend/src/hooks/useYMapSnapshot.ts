import { useCallback, useRef, useSyncExternalStore } from "react";
import * as Y from "yjs";
export function useYMapSnapshot<V>(ymap: Y.Map<V>): Map<string, V> {
    const storeRef = useRef<{ ymap: Y.Map<V>; snapshot: Map<string, V> }>({
      ymap,
      snapshot: new Map(ymap.entries()),
    });
  
    // ymapインスタンスが差し替わった場合は初期スナップショットを更新
    if (storeRef.current.ymap !== ymap) {
      storeRef.current = { ymap, snapshot: new Map(ymap.entries()) };
    }
  
    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        const observer = () => {
          // 変更が起きた時だけ新しい参照へ更新する
          storeRef.current.snapshot = new Map(ymap.entries());
          onStoreChange();
        };
        ymap.observe(observer);
        return () => ymap.unobserve(observer);
      },
      [ymap]
    );
  
    const getSnapshot = useCallback(() => storeRef.current.snapshot, []);
  
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }