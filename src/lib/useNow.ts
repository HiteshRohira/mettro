import { useEffect, useState } from 'react';

/** Current time that re-renders every `ms`. Keeps render pure for the React Compiler. */
export function useNow(ms = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
