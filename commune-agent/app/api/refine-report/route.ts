import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { reportMarkdown, comment } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    messages: [
      {
        role: "user",
        content: `Tu es un assistant expert en analyse immobilière et données publiques françaises.
Voici un rapport (texte markdown + blocs \`\`\`json-viz pour les graphiques et tableaux) :

---
${reportMarkdown}
---

L'utilisateur demande la modification suivante :
${comment}

Règles strictes :
- Renvoie **uniquement** le rapport modifié, sans commentaire ni explication
- Conserve exactement le même format : markdown pour le texte, blocs \`\`\`json-viz\`\`\` pour les graphiques/tableaux
- Ne renvoie PAS de balise \`\`\`markdown wrapper autour de l'ensemble
- Modifie uniquement ce qui est demandé ; conserve le reste à l'identique
- Si une modification porte sur un tableau ou graphique, mets à jour le bloc \`\`\`json-viz\`\`\` correspondant`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of result.textStream) {
          controller.enqueue(encoder.encode(text));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
