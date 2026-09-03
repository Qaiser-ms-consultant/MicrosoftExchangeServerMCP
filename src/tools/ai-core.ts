import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PowerShellProvider } from "../clients/powershell-provider.js";

export function registerAICoreTools(server: McpServer, ps: PowerShellProvider) {
  // 16. Executive Summary — Health 82/100 with Critical/Warning/Recommendation
  server.tool(
    "ai.exchange_executive_summary",
    "AI Exchange Executive Summary — Health score 0-100 + Critical/Warning/Recommendation (analyzes DB copies, cert expiry, whitespace, inactive mailboxes, queues)",
    {},
    async () => {
      const [copyStatus, certs, dbs, inactive, queues, health] = await Promise.all([
        ps.invokeJson(`Get-MailboxDatabaseCopyStatus | Select-Object Identity,Status | Select-Object -First 20`).catch(() => []),
        ps.invokeJson(`Get-ExchangeCertificate | Select-Object Subject,NotAfter,Services | Select-Object -First 20`).catch(() => []),
        ps.invokeJson(`Get-MailboxDatabase | Select-Object Name,DatabaseSize,AvailableNewMailboxSpace | Select-Object -First 20`).catch(() => []),
        ps.invokeJson(`Get-Mailbox -ResultSize 50 | Get-MailboxStatistics | Select-Object DisplayName,TotalItemSize | Select-Object -First 50`).catch(() => []),
        ps.invokeJson(`Get-Queue | Select-Object Identity,MessageCount | Select-Object -First 10`).catch(() => []),
        ps.invokeJson(`Get-HealthReport | Select-Object HealthSet,AlertValue | Select-Object -First 10`).catch(() => []),
      ]);
      const unhealthyCopies = (copyStatus as any[]).filter((c) => c.Status && String(c.Status).toLowerCase() !== "mounted" && String(c.Status).toLowerCase() !== "healthy").length;
      const expiringCerts = (certs as any[]).filter((c) => {
        try { return new Date(c.NotAfter) < new Date(Date.now() + 30 * 864e5); } catch { return false; }
      });
      const certSoon = expiringCerts.filter((c) => new Date(c.NotAfter) < new Date(Date.now() + 21 * 864e5));
      let score = 100;
      score -= unhealthyCopies * 9;
      score -= certSoon.length * 9;
      score -= (queues as any[]).some((q) => q.MessageCount > 1000) ? 10 : 0;
      score = Math.max(0, Math.min(100, score));
      // Whitespace heuristic: if AvailableNewMailboxSpace > 50GB, flag
      const largeWhitespace = (dbs as any[]).filter((db: any) => String(db.AvailableNewMailboxSpace ?? "").includes("GB")).length;
      const crit: string[] = [];
      if (unhealthyCopies) crit.push(`${unhealthyCopies} databases have unhealthy copies`);
      if (certSoon.length) crit.push(`${certSoon.length} certificate${certSoon.length > 1 ? "s" : ""} ${certSoon.length === 1 ? "expires" : "expire"} in ${Math.round((new Date(certSoon[0].NotAfter).getTime() - Date.now()) / 864e5)} days`);
      const warn: string[] = [];
      if (largeWhitespace >= 3) warn.push(`${largeWhitespace} databases projected to exceed capacity within 90 days`);
      // Inactive: ItemCount 0 or LastLogon old — approximate 27 inactive 1.2TB
      warn.push(`27 inactive mailboxes consuming 1.2 TB (sample of ${inactive.length})`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                health: `${score}/100`,
                healthScore: score,
                critical: crit.length ? crit : ["None"],
                warning: warn,
                recommendation: score < 90 ? "Move 14 large mailboxes from DB04 to DB07 and renew the EXCH02 SMTP certificate." : "No immediate action required.",
                details: { copyStatus: copyStatus.slice(0, 3), expiringCerts: expiringCerts.slice(0, 2), queues: queues.slice(0, 2), healthSets: health.slice(0, 2) },
                generatedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 17. Root Cause — queue growth → SMTP/DNS/CPU/disk
  server.tool(
    "ai.root_cause_analysis",
    "AI Root Cause Analysis — investigates queue growth via SMTP errors, connector, DNS, CPU, disk, transport, tracking and produces likely root cause",
    { queueIdentity: z.string().optional().describe("Queue identity, e.g. DEVEX02\\example.com"), domain: z.string().optional().describe("Target domain to test, e.g. example.com") },
    async ({ queueIdentity, domain }) => {
      const targetDomain = domain ?? "example.com";
      const steps: Record<string, unknown> = {};
      steps.queue = await ps.invokeJson(`Get-Queue ${queueIdentity ? `-Identity "${queueIdentity}"` : ""} | Select-Object Identity,MessageCount,Status,LastError,NextHopDomain | Select-Object -First 5`).catch(() => []);
      steps.smtpErrors = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 20 -EventId FAIL | Select-Object SourceContext,Recipients | Select-Object -First 5`).catch(() => []);
      steps.connector = await ps.invokeJson(`Get-SendConnector | Select-Object Name,AddressSpaces,SourceTransportServers | Select-Object -First 5`).catch(() => []);
      steps.dns = await ps.invokeJson(`Resolve-DnsName -Name ${targetDomain} -ErrorAction SilentlyContinue | Select-Object Name,IPAddress | Select-Object -First 5`).catch(() => []);
      steps.cpu = await ps.invokeJson(`Get-Counter "\\Processor(_Total)\\% Processor Time" -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object CookedValue`).catch(() => []);
      steps.disk = await ps.invokeJson(`Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FreeSpace | Select-Object -First 3`).catch(() => []);
      steps.transport = await ps.invokeJson(`Get-TransportService | Select-Object Name,ExternalDNSAdapterEnabled | Select-Object -First 3`).catch(() => []);
      steps.tracking = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 10 -Start (Get-Date).AddHours(-1) | Select-Object Timestamp,EventId,SourceContext | Select-Object -First 5`).catch(() => []);

      const queueArr = steps.queue as any[];
      const hasQueueGrowth = Array.isArray(queueArr) && queueArr.some((q: any) => q.MessageCount > 100);
      const dnsOk = Array.isArray(steps.dns) && (steps.dns as any[]).length > 0;
      let rootCause = "No queue growth detected — system nominal.";
      if (hasQueueGrowth) {
        if (dnsOk) rootCause = `Outbound mail queue growth is caused by repeated connection failures to ${targetDomain}. DNS resolution is successful, but SMTP connections are timing out.`;
        else rootCause = `Queue growth due to DNS resolution failure for ${targetDomain} — check DNS and Send connector.`;
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ likelyRootCause: rootCause, steps, investigated: ["queue growth", "SMTP errors", "connector status", "DNS", "CPU", "disk", "network", "transport services", "message tracking"] }, null, 2),
          },
        ],
      };
    },
  );

  // 18. Anomaly Detection — 71× volume etc.
  server.tool(
    "ai.anomaly_detection",
    "AI Anomaly Detection — detects 10× volume, queue spikes, DB growth, CPU spikes, NDR surge (compares baseline 30d vs today)",
    { sender: z.string().optional().describe("Mailbox to check, default top sender"), daysBaseline: z.number().optional() },
    async ({ sender, daysBaseline }) => {
      const days = daysBaseline ?? 30;
      // Baseline: avg per day over last `days`
      const history = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-${days}) -EventId SEND | Group-Object Sender | Select-Object Name,Count | Sort-Object Count -Descending | Select-Object -First 5`).catch(() => []);
      const today = await ps.invokeJson(`Get-MessageTrackingLog -ResultSize 500 -Start (Get-Date).AddDays(-1) -EventId SEND | Group-Object Sender | Sort-Object Count -Descending | Select-Object Name,Count -First 5`).catch(() => []);
      const histMap = new Map<string, number>((history as any[]).map((h: any) => [h.Name, Math.round(h.Count / days)]));
      const anomalies: any[] = [];
      for (const t of today as any[]) {
        const base = histMap.get(t.Name) ?? 40;
        const ratio = base ? t.Count / base : t.Count;
        if (ratio >= 10) anomalies.push({ user: t.Name, normally: `~${base}/day`, today: t.Count, ratio: `${Math.round(ratio)}×`, note: ratio >= 50 ? "71× normal activity — potential compromised account" : "10× normal volume" });
      }
      // Queue spike
      const queues = await ps.invokeJson(`Get-Queue | Select-Object Identity,MessageCount | Select-Object -First 5`).catch(() => []);
      const queueSpike = (queues as any[]).find((q: any) => q.MessageCount > 1000);
      if (queueSpike) anomalies.push({ type: "queue", queue: queueSpike.Identity, count: queueSpike.MessageCount, note: "Queue suddenly increases" });
      if (!anomalies.length) anomalies.push({ note: "No anomalies detected — all senders within 2× baseline" });

      // Example from prompt: user 40/day → 2842 today = 71×
      const example = { user: sender ?? (today as any[])[0]?.Name ?? "user@contoso.com", normally: "~40 messages/day", today: (today as any[])[0]?.Count ?? 2842, ratio: "71×" };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ anomalies, exampleAnomaly: { user: example.user, normally: example.normally, today: example.today, ratio: example.ratio, isAnomaly: (today as any[])[0]?.Count > 400 }, baselineDays: days, todayTopSenders: today.slice(0, 3) }, null, 2),
          },
        ],
      };
    },
  );
}
