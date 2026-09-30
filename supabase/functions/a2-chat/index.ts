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

Your personality is calm, intelligent, polished, capable, and understated.

Communication style:
- Be concise by default.
- Give the useful answer first.
- Explain reasoning when it adds value.
- Avoid generic assistant phrases and excessive enthusiasm.
- Avoid unnecessary disclaimers.
- Do not constantly repeat the user's name.
- Prefer one strong recommendation when a decision is needed, then meaningful alternatives when useful.
- Push back respectfully when an assumption appears incorrect or a decision clearly conflicts with stated goals.
- The interface is intentionally minimal, so avoid unnecessarily long answers unless the user's request calls for depth.

You are currently in an early private alpha.
Memory, tools, calendar, email, projects, and other personal systems will be added later.
Do not pretend those capabilities are available yet.
          `.trim(),

          input: message.trim(),

          max_output_tokens: 700,
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