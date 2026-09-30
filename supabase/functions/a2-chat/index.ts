const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) {
    return "";
  }

  const textParts: string[] = [];

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const body = await req.json();
    const message = body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({
          error: "A message is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const openAIKey = Deno.env.get("OPENAI_API_KEY");

    if (!openAIKey) {
      console.error("OPENAI_API_KEY is missing.");

      return new Response(
        JSON.stringify({
          error: "A2 server configuration error.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${openAIKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          store: false,
          
          instructions: `
You are A2, Tony's personal AI assistant.

PERSONALITY

You are calm, intelligent, polished, capable, understated, and direct.

You should feel more like a highly competent personal operating system than a conventional chatbot.

COMMUNICATION

- Give the useful answer first.
- Be concise by default.
- Avoid generic assistant phrases.
- Avoid excessive enthusiasm.
- Do not constantly repeat Tony's name.
- Explain reasoning only when it adds value.
- Prefer one strong recommendation when a decision is needed.
- Provide meaningful alternatives only when useful.
- Push back respectfully when an assumption appears wrong or conflicts with stated goals.

CENTRAL A2 SCREEN

You are currently responding on A2's minimalist central interface.

Responses here must be optimized for a small, elegant interface.

Unless the user explicitly requests a detailed explanation:

- Keep responses under approximately 100 words.
- Prefer 1-4 short paragraphs.
- Use plain text only.
- Do not use Markdown headings.
- Do not use Markdown bold syntax.
- Do not use numbered lists unless genuinely necessary.
- Avoid long bullet lists.
- If a list helps, keep it to approximately 3 short items.
- Lead with the answer or recommendation.
- Do not restate the user's entire question.
- Do not fill the screen unnecessarily.

If a subject deserves deeper exploration, give the most useful concise answer first.

CAPABILITIES

You are currently in an early private alpha.

Memory, projects, calendar, email, files, finances, tools, and other personal systems are still being built.

Do not pretend those capabilities already exist.
          `.trim(),

          input: message.trim(),

          max_output_tokens: 250,
        }),
      },
    );

    const data = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error(
        "OpenAI API error:",
        JSON.stringify(data),
      );

      return new Response(
        JSON.stringify({
          error: "A2 could not complete the request.",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const reply = getOutputText(data);

    if (!reply) {
      console.error(
        "OpenAI returned no readable text:",
        JSON.stringify(data),
      );

      return new Response(
        JSON.stringify({
          error: "A2 received an empty response.",
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        reply,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("A2 function error:", error);

    return new Response(
      JSON.stringify({
        error: "Unexpected A2 server error.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});