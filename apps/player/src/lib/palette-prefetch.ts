import { apiQueries } from "./api-queries";
import { queries, queryClient } from "./queries";

/** Everything the palette shows when it opens, fetched ahead so it never loads in front of you. */
export function prefetchPalette(): void {
  void queryClient.prefetchQuery(apiQueries.session());
  void queryClient.prefetchQuery(queries.playlists());
  void queryClient.prefetchQuery(queries.genres());
}
