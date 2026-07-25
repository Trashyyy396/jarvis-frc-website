import { GoogleAuth } from "google-auth-library";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEPLOY_DIR = path.join(ROOT, "deploy");
const PUBLIC_DIR = path.join(DEPLOY_DIR, "public");
const SITE_ID = process.env.FIREBASE_SITE_ID ?? "wheelhouse-foundation-website";
const LIVE_ORIGIN =
  process.env.FIREBASE_LIVE_ORIGIN ?? `https://${SITE_ID}.web.app`;
const HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1";

function getAuthOptions() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    return { credentials: JSON.parse(raw) };
  }

  return {};
}

async function createAuthClient() {
  const auth = new GoogleAuth({
    ...getAuthOptions(),
    scopes: ["https://www.googleapis.com/auth/firebase"],
  });

  return auth.getClient();
}

async function hostingRequest(client, url) {
  const response = await client.request({ url });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Hosting API request failed (${response.status}): ${url}`);
  }

  return response.data;
}

async function getLiveVersionName(client) {
  const channel = await hostingRequest(
    client,
    `${HOSTING_API}/sites/${SITE_ID}/channels/live`
  );

  const versionName = channel?.release?.version?.name;
  if (!versionName) {
    throw new Error("Could not resolve live Hosting version.");
  }

  return versionName;
}

async function listVersionFiles(client, versionName) {
  const files = [];
  let pageToken;

  do {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const data = await hostingRequest(
      client,
      `${HOSTING_API}/${versionName}/files?${query.toString()}`
    );

    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function downloadFile(filePath) {
  const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const url = new URL(normalizedPath, `${LIVE_ORIGIN}/`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url} (${response.status} ${response.statusText})`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function writePublicFile(relativePath, contents) {
  const destination = path.join(PUBLIC_DIR, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, contents);
}

async function mirrorLiveSite(client) {
  const versionName = await getLiveVersionName(client);
  const files = await listVersionFiles(client, versionName);

  if (files.length === 0) {
    throw new Error("Live Hosting release contains no files.");
  }

  console.log(`Mirroring ${files.length} files from ${LIVE_ORIGIN}`);

  for (const file of files) {
    const relativePath = file.path.startsWith("/") ? file.path.slice(1) : file.path;
    const contents = await downloadFile(relativePath);
    await writePublicFile(relativePath, contents);
  }
}

async function copyJarvisSite() {
  const source = path.join(ROOT, "index.html");
  const destination = path.join(PUBLIC_DIR, "jarvis", "index.html");

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);

  console.log("Added Jarvis site at /jarvis/");
}

async function prepareDeployDirectory() {
  await fs.rm(PUBLIC_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  const client = await createAuthClient();
  await mirrorLiveSite(client);
  await copyJarvisSite();

  console.log(`Deploy bundle ready in ${DEPLOY_DIR}`);
}

prepareDeployDirectory().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
