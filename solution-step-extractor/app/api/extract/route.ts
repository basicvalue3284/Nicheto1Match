import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT =
  "Role: You are a Senior Technical Documentation Expert. Task: Provide a detailed, One-Take recording map for the user's video title. THE GOAL: State the primary outcome for the viewer in 1 clear sentence. PREPARATION (CRITICAL): 1. PRICING STATUS: Explicitly state if this task is achievable on the FREE version of the software or if it requires a PAID/PREMIUM subscription. If uncertain, say verification is required and explain what to verify. 2. ASSETS: List any files, accounts, permissions, integrations, or pages the freelancer needs open before hitting Record. IN-DETAIL STEP-BY-STEP (UI LANDMARKS): Provide sequential steps. For every action, describe the UI Landmark, such as button color, location on screen, sidebar position, label text, icon shape, menu name, or panel location. Do NOT just say Click Settings. Do say Navigate to the gear icon in the bottom-left corner labeled Settings. If a task involves connecting accounts via a Trading Panel, Broker List, or standard login, prioritize OAuth secure browser pop-ups and authorization toggles rather than assuming the user must manually input raw API secret keys, unless explicitly stated. THE ONE-TAKE WARNINGS: Identify dead air moments such as slow page loads, hidden UI, delayed pop-ups, confirmation screens, permissions, plan limits, or places where the freelancer should wait before moving the mouse. Return ONLY valid JSON with this exact shape: {\"appToolName\":\"\",\"goal\":\"\",\"preparation\":\"\",\"flow\":[\"\"],\"trickyPart\":\"\"}. No markdown.";

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ResearcherMap = {
  appToolName: string;
  goal: string;
  preparation: string;
  flow: string[];
  trickyPart: string;
};

function normalizeResearcherMap(content: string): ResearcherMap | null {
  try {
    const parsed = JSON.parse(content) as Partial<ResearcherMap>;
    const flow = Array.isArray(parsed.flow)
      ? parsed.flow.filter((item): item is string => typeof item === "string")
      : [];

    if (
      typeof parsed.appToolName !== "string" ||
      typeof parsed.goal !== "string" ||
      typeof parsed.preparation !== "string" ||
      typeof parsed.trickyPart !== "string" ||
      flow.length === 0
    ) {
      return null;
    }

    return {
      appToolName: parsed.appToolName.trim(),
      goal: parsed.goal.trim(),
      preparation: parsed.preparation.trim(),
      flow: flow.map((item) => item.trim()).filter(Boolean),
      trickyPart: parsed.trickyPart.trim()
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!title) {
      return NextResponse.json(
        { error: "Enter a video title or topic." },
        { status: 400 }
      );
    }

    if (title.length > 300) {
      return NextResponse.json(
        { error: "Keep the title under 300 characters." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: title
          }
        ]
      })
    });

    const data = (await openAIResponse.json()) as OpenAIChatResponse;

    if (!openAIResponse.ok) {
      return NextResponse.json(
        { error: data.error?.message || "OpenAI request failed." },
        { status: openAIResponse.status }
      );
    }

    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "No researcher map was returned." },
        { status: 502 }
      );
    }

    const researcherMap = normalizeResearcherMap(content);

    if (!researcherMap) {
      return NextResponse.json(
        { error: "The researcher map response was not usable." },
        { status: 502 }
      );
    }

    return NextResponse.json({ map: researcherMap });
  } catch {
    return NextResponse.json(
      { error: "Invalid request. Please try again." },
      { status: 400 }
    );
  }
}
