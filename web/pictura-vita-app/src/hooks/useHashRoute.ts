import { useEffect, useState } from 'react';

/**
 * Where in the app the browser currently is.
 *
 * `index` is the table of contents; `timeline` is one timeline, open.
 */
export type Route = { kind: 'index' } | { kind: 'timeline'; timelineId: string };

/**
 * Routing, in a hash.
 *
 * `#/` is the index and `#/t/<timeline id>` is a timeline, so a reload comes back to the same
 * place, the back button works, and a timeline can be bookmarked. The fragment never reaches
 * the server, which suits an app whose whole premise is that a timeline id is nobody's
 * business but the machine it is on — it stays out of request lines and out of any log.
 *
 * A hash rather than the History API, and no router dependency, because two routes do not
 * justify either. If this ever grows a third level, replace it wholesale rather than
 * extending the parser.
 */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Assigning the hash is what drives the change: the listener above then runs, so navigating
  // and arriving are the same code path whether the app or the back button caused it.
  const navigate = (next: Route) => {
    window.location.hash = toHash(next);
  };

  return [route, navigate];
}

export function toHash(route: Route): string {
  return route.kind === 'index' ? '#/' : `#/t/${route.timelineId}`;
}

/**
 * Anything that is not a route we recognise reads as the index. A hand-edited or truncated
 * URL should land somewhere usable rather than on a blank page.
 */
function parse(hash: string): Route {
  const id = /^#\/t\/([^/?#]+)/.exec(hash)?.[1];

  return id ? { kind: 'timeline', timelineId: decodeURIComponent(id) } : { kind: 'index' };
}
