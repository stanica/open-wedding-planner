import { useState, useEffect, useCallback } from "react";
import { wsClient } from "../lib/ws-client";

interface UseRequestResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useRequest<T = unknown>(
  method: string,
  params?: unknown,
): UseRequestResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const serializedParams = JSON.stringify(params);

  const refetch = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    wsClient
      .request<T>(method, params)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [method, serializedParams, version]);

  return { data, error, loading, refetch };
}

export function useMutation<TParams = unknown, TResult = unknown>(
  method: string,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (params: TParams): Promise<TResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await wsClient.request<TResult>(method, params);
        setLoading(false);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setLoading(false);
        throw err;
      }
    },
    [method],
  );

  return { mutate, loading, error };
}
