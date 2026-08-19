import { permanentRedirect } from "next/navigation";

// Keep a single canonical patient homepage. The detailed Découvrir page is
// now the public entry point, so old bookmarks to `/` follow it automatically.
//
// permanentRedirect (308), not redirect (307): 307 tells crawlers "this move
// is temporary", so `/` stays a competing candidate for the homepage and the
// ranking signals pointing at it are not consolidated onto /decouvrir. 308
// says the move is permanent and passes them along.
export default function ShowcaseHomePage() {
  permanentRedirect("/decouvrir");
}
