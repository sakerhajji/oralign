import { redirect } from "next/navigation";

// Keep a single canonical patient homepage. The detailed Découvrir page is
// now the public entry point, so old bookmarks to `/` follow it automatically.
export default function ShowcaseHomePage() {
  redirect("/decouvrir");
}
