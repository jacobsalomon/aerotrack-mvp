// Attio CRM client — pushes visitor data when someone accesses a gate.
// Uses upsert (PUT) so repeat visitors update the existing record.

const ATTIO_API_BASE = "https://api.attio.com/v2";

function getApiKey(): string | null {
  return process.env.ATTIO_API_KEY?.trim() || null;
}

async function attioFetch(path: string, options: RequestInit = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Attio] ATTIO_API_KEY not set — skipping CRM push");
    return null;
  }

  const res = await fetch(`${ATTIO_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Attio] ${options.method || "GET"} ${path} failed: ${res.status} ${body}`);
    return null;
  }

  return res.json();
}

// Create or update a person by email (prevents duplicates)
export async function upsertPerson(name: string, email: string) {
  // Split name into first/last
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  const result = await attioFetch("/objects/people/records?matching_attribute=email_addresses", {
    method: "PUT",
    body: JSON.stringify({
      data: {
        values: {
          name: [{ first_name: firstName, last_name: lastName, full_name: name.trim() }],
          email_addresses: [{ email_address: email }],
        },
      },
    }),
  });

  return result?.data?.id?.record_id || null;
}

// Add a person to the "Inbound Leads" list
export async function addToInboundLeads(recordId: string) {
  // First, find or create the "Inbound Leads" list
  const listsRes = await attioFetch("/lists");
  if (!listsRes) return;

  const lists = listsRes?.data || [];
  let listId = lists.find(
    (l: { name: string; id: { list_id: string } }) =>
      l.name === "Inbound Leads"
  )?.id?.list_id;

  // Create the list if it doesn't exist
  if (!listId) {
    const created = await attioFetch("/lists", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: "Inbound Leads",
          api_slug: "inbound_leads",
          parent_object: "people",
          workspace_access: "full-access",
          workspace_member_access: [],
        },
      }),
    });
    listId = created?.data?.id?.list_id;
  }

  if (!listId) return;

  // Add the person to the list (ignore if already there)
  await attioFetch(`/lists/${listId}/entries`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        parent_object: "people",
        parent_record_id: recordId,
        entry_values: {},
      },
    }),
  });
}

// Add a note to a person record
export async function createNote(recordId: string, content: string) {
  await attioFetch("/notes", {
    method: "POST",
    body: JSON.stringify({
      data: {
        parent_object: "people",
        parent_record_id: recordId,
        title: "Gate Access",
        format: "plaintext",
        content: content,
      },
    }),
  });
}

// Send email notification to Jake via AgentMail SDK
export async function sendAccessNotification(
  visitorName: string,
  visitorEmail: string,
  page: "investor deck" | "AeroVision demo"
) {
  const agentMailKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!agentMailKey) {
    console.warn("[Notify] AGENTMAIL_API_KEY not set — skipping notification");
    return;
  }

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const subject = `New ${page === "investor deck" ? "Deck" : "Demo"} Viewer: ${visitorName}`;
  const body = [
    `Someone just accessed the ${page}.`,
    "",
    `Name: ${visitorName}`,
    `Email: ${visitorEmail}`,
    `Page: ${page}`,
    `Time: ${now} CT`,
    "",
    "They've been added to the Inbound Leads list in Attio.",
  ].join("\n");

  try {
    const inboxId = encodeURIComponent("sal@ai.mechanicalvisioncorp.com");
    await fetch(`https://api.agentmail.to/v0/inboxes/${inboxId}/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentMailKey}`,
      },
      body: JSON.stringify({
        to: ["jake@mechanicalvisioncorp.com"],
        subject,
        text: body,
      }),
    });
  } catch (err) {
    console.error("[Notify] Failed to send access notification:", err);
  }
}

// Jake's emails — skip CRM push and notification for these
const OWNER_EMAILS = [
  "jake@mechanicalvisioncorp.com",
  "jacob.salomon@circuit.ai",
  "jacobrsalomon@gmail.com",
];

function isOwner(email: string): boolean {
  return OWNER_EMAILS.includes(email.toLowerCase().trim());
}

// Main function — call this after successful passcode verification
export async function trackGateAccess(
  name: string,
  email: string,
  page: "investor deck" | "AeroVision demo"
) {
  // Skip tracking for Jake
  if (isOwner(email)) return;

  try {
    const now = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Push to Attio CRM
    const recordId = await upsertPerson(name, email);
    if (recordId) {
      await addToInboundLeads(recordId);
      await createNote(recordId, `Accessed ${page} on ${now}`);
    }

    // Email Jake
    await sendAccessNotification(name, email, page);
  } catch (err) {
    // Never let CRM/email failures break the gate
    console.error("[TrackGateAccess] Error:", err);
  }
}
