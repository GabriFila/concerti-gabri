import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On a Netlify deploy preview the tab is otherwise indistinguishable from
// production (and from every other open preview), so prefix the title with the
// PR number: "#42 · Gabri ai concerti". Netlify sets CONTEXT/REVIEW_ID at build
// time; locally and on production both are absent and the title is untouched.
function prTitle() {
  return {
    name: "pr-preview-title",
    transformIndexHtml(html: string) {
      const { CONTEXT, REVIEW_ID } = process.env;
      if (CONTEXT !== "deploy-preview" || !REVIEW_ID) return html;
      return html.replace(/<title>([^<]*)<\/title>/, `<title>#${REVIEW_ID} · $1</title>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), prTitle()],
});
