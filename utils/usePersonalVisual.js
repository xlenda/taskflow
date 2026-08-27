import { useEffect, useState } from 'react';
import { acquirePersonalVisual } from '../services/personalVisualStorage';

export function usePersonalVisual(cacheKey) {
  const [uri, setUri] = useState(null);

  useEffect(() => {
    let active = true;
    let release = null;
    setUri(null);

    if (!cacheKey) return () => {};

    acquirePersonalVisual(cacheKey)
      .then((resource) => {
        if (!resource) return;
        if (!active) {
          resource.release();
          return;
        }
        release = resource.release;
        setUri(resource.uri);
      })
      .catch(() => {});

    return () => {
      active = false;
      if (release) release();
    };
  }, [cacheKey]);

  return uri;
}
