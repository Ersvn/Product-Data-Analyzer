import { useState, useCallback } from "react";

export function useAsync(fn) {
    const [status, setStatus] = useState("idle");
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const run = useCallback(async (...args) => {
        setStatus("loading");
        setError(null);

        try {
            const res = await fn(...args);
            setData(res);
            setStatus("success");
            return res;
        } catch (e) {
            setError(e);
            setStatus("error");
            throw e;
        }
    }, [fn]);

    return {
        run,
        status,
        data,
        error,
        isLoading: status === "loading",
        isError: status === "error",
        isSuccess: status === "success"
    };
}
