const SYSTEM_PROMPT = `You are J.A.R.V.I.S, the website assistant for FRC Team #11799 J.A.R.V.I.S.
Answer ONLY using the facts below. If the answer isn't here, say you're not sure and suggest emailing donations@wheelhousefoundationdfw.com.
Keep answers to 2-4 friendly sentences, plain text, no markdown. Never invent numbers, dates, names, or benefits.
If a detail (like meeting times or costs) isn't in the facts, say you don't have it instead of guessing.

FACTS:
- J.A.R.V.I.S is the FIRST Robotics Competition (FRC) team of the Wheelhouse Foundation DFW, a 501(c)(3) nonprofit (EIN 85-3925098), based in the Dallas-Fort Worth metroplex.
- Rookie FRC season: 2027. 35+ students. Programs: VEX IQ, VEX V5, VEX AI, FRC, RECF Achieve, RECF Engage.
- Six Wheelhouse teams qualified for the 2026 VEX World Championship. Students have earned Excellence Awards, Tournament Champion titles, Design Awards, and Robot Skills Championships in VEX.
- Outreach: STEM camps and workshops reaching 75+ students a year, mentoring 10+ VEX and FTC teams, Scratch and Python workshops, and STEM advocacy presentations to elected officials on Capitol Hill at the National Advocacy Conference.
- Joining: open to any high school student in the DFW area, no experience needed. Fill out the interest form in the Join section. Subteams: Mechanical & Fabrication, Software & Programming, CAD & Design, Electrical & Controls, Business.
- Mentors: Hema Damle, Yogesh Damle, Arnav Damle, Ravi Madavarapu, Kartik Gandhi, Nishant Bhatt. To become a mentor, click "Apply Now" in the Mentors section.
- Sponsorship: benefits are per season, individual and corporate sponsors are welcome, and donations are tax-deductible through the Wheelhouse Foundation DFW. Each tier includes everything in the tiers below it.
  - Supporter ($500-$999): company logo on the team shirt and banner, personalized thank-you letter.
  - Bronze ($1,000-$2,499): company logo on this website, 1 social media post.
  - Silver ($2,500-$4,999): small logo on the robot, 1 social media post every 3 months, team photo with a signed thank-you card.
  - Gold ($5,000-$9,999): medium logo on the robot, medium logo on shirts, 1 social media shout-out per month, recognition in newsletters, certificate of appreciation.
  - Platinum ($10,000+): naming rights ("J.A.R.V.I.S presented by [your company]"), largest logo on the robot, large logo on team shirts, mention in all media and events, VIP invite to competitions, 2 social media shout-outs per month, sponsor plaque and thank-you video, on-site demo for your company.
  - In-kind donations of FRC-useful parts (like brushless motors and gearboxes) count toward a tier by market value.
  - Current sponsors include Boeing and Haas. To sponsor, click "Become a Sponsor" or email donations@wheelhousefoundationdfw.com.
- Contact: donations@wheelhousefoundationdfw.com, +1 (972) 971-9343, Instagram @wheelhouse_foundation.`;

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Models are tried in order. NVIDIA retires older models from its free endpoints
// ("Function ... Not found for account" = 404), so if one is gone we move on to the next.
// Set NVIDIA_MODEL in Netlify to put a different model first.
const MODELS = [
  process.env.NVIDIA_MODEL,
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "z-ai/glm-5.3-flash",
  "deepseek-ai/deepseek-v4.1-flash",
  "openai/gpt-oss-20b",
  "google/gemma-3-12b-it",
].filter(Boolean);

// Netlify stops a function after about 10 seconds, so everything shares a 9 second budget.
const TIME_BUDGET_MS = 9000;
// NVIDIA's free tier sometimes queues a request for a long time. If a model hasn't answered
// within this many ms, we also start the next model, and use whichever answers first.
const HEDGE_MS = 3500;

// Newer models "think" before answering by default, which is slow. These settings turn
// that off. If a model rejects them (400/422), we retry that model once without them.
const NO_THINKING = {
  chat_template_kwargs: { enable_thinking: false, thinking: false },
  reasoning_effort: "low",
};

// The Firebase copy of the site (/jarvis) is a different website, so the browser
// needs permission (CORS) before it can call this function.
const ALLOWED_ORIGINS = [
  "https://jarvisfrcv.netlify.app",
  "https://wheelhouse-foundation-website.web.app",
  "https://wheelhouse-foundation-website.firebaseapp.com",
];

const corsHeaders = (req) => {
  const origin = req.headers.get("origin");
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
};

// Removes markdown and "thinking" text some models add, so the chat bubble stays plain.
const cleanReply = (text) =>
  String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[*-]\s+/gm, "")
    .trim();

// Asks one model. Returns the reply text, or throws an error with .status set.
async function tryModel(model, apiKey, message, signal) {
  let status = 0;
  for (const extra of [NO_THINKING, {}]) {
    const res = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        max_tokens: 600,
        temperature: 0.3,
        ...extra,
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      const reply = cleanReply(data?.choices?.[0]?.message?.content);
      if (reply) return reply;
      console.error(`NVIDIA ${model}: empty reply`);
      status = 502;
      break;
    }

    status = res.status;
    console.error(`NVIDIA ${model} error ${res.status}:`, (await res.text()).slice(0, 300));
    // Only a rejected request body is worth retrying on the same model.
    if (res.status !== 400 && res.status !== 422) break;
  }
  throw Object.assign(new Error(`${model} failed`), { status });
}

// Tries the models in order, starting the next one early if the current one is slow.
// Resolves with { reply, model } on success, or { status } if every model failed.
function askNvidia(apiKey, message) {
  return new Promise((resolve) => {
    const deadline = Date.now() + TIME_BUDGET_MS;
    const controllers = new Set();
    let next = 0;
    let running = 0;
    let finished = false;
    let lastStatus = 0;
    let hedgeTimer;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(hedgeTimer);
      controllers.forEach((c) => c.abort());
      resolve(result);
    };

    const launch = () => {
      clearTimeout(hedgeTimer);
      if (finished) return;
      const timeLeft = deadline - Date.now();
      if (next >= MODELS.length || timeLeft < 1000) {
        if (running === 0) finish({ status: lastStatus });
        return;
      }

      const model = MODELS[next++];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeLeft);
      controllers.add(controller);
      running++;
      hedgeTimer = setTimeout(launch, HEDGE_MS);

      tryModel(model, apiKey, message, controller.signal)
        .then((reply) => finish({ reply, model }))
        .catch((err) => {
          if (finished) return;
          lastStatus = err.status || 504;
          if (!err.status) console.error(`NVIDIA ${model} request failed:`, err.name, err.message);
          // 401 = bad key, 429 = rate limited. Other models won't help.
          if (lastStatus === 401 || lastStatus === 429) return finish({ status: lastStatus });
          running--;
          launch();
        })
        .finally(() => {
          clearTimeout(timer);
          controllers.delete(controller);
        });
    };

    launch();
  });
}

export default async (req) => {
  const cors = corsHeaders(req);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY is missing. Add it in Netlify > Site configuration > Environment variables, then redeploy.");
    return json({ error: "AI not configured" }, 500);
  }

  const { message } = await req.json().catch(() => ({}));
  if (typeof message !== "string" || !message.trim() || message.length > 500) {
    return json({ error: "Invalid message" }, 400);
  }

  const result = await askNvidia(apiKey, message.trim());
  if (result.reply) return json({ reply: result.reply, model: result.model });
  return json({ error: "AI unavailable", status: result.status }, 502);
};
