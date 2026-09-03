import axios from "axios";
import https from "node:https";

export async function testConnectivity(opts: { endpoint: string; powershellUri: string; ewsPath: string; insecure: boolean }) {
  const agent = opts.insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const results: Record<string, unknown> = {};

  const testUrl = async (url: string, method: "GET" | "POST" = "GET", body?: string) => {
    try {
      const res = await axios({
        method,
        url,
        data: body,
        headers: body ? { "Content-Type": "text/xml; charset=utf-8" } : {},
        httpsAgent: agent as any,
        validateStatus: () => true,
        timeout: 8000,
      });
      return { url, status: res.status, ok: res.status < 400, hint: res.status === 401 ? "401 — check BasicAuthentication on virtual directory" : res.status === 404 ? "404 — check host/path (must be /PowerShell or /EWS/Exchange.asmx)" : undefined, preview: typeof res.data === "string" ? res.data.slice(0, 400).replace(/\s+/g, " ") : JSON.stringify(res.data).slice(0, 400) };
    } catch (e: any) {
      return { url, error: e.message, code: e.code };
    }
  };

  results.powershell = await testUrl(opts.powershellUri, "GET");
  const ewsBody = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"><soap:Header><t:RequestServerVersion Version="Exchange2016"/></soap:Header><soap:Body><m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape></m:ItemShape><m:IndexedPageItemView MaxEntriesReturned="1" Offset="0" BasePoint="Beginning"/><m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds></m:FindItem></soap:Body></soap:Envelope>`;
  results.ews = await testUrl(opts.endpoint.replace(/\/$/, "") + opts.ewsPath, "POST", ewsBody);
  results.rest = await testUrl(opts.endpoint.replace(/\/$/, "") + "/api/v2.0", "GET");
  results.insecure = opts.insecure;
  return results;
}

// CLI entry when run directly
if (import.meta.url.endsWith("doctor.ts") || process.argv[1]?.endsWith("doctor.ts") || process.argv[1]?.endsWith("doctor.js")) {
  const endpoint = process.env.EXCHANGE_ENDPOINT ?? "https://mail.contoso.com";
  const ps = process.env.EXCHANGE_POWERSHELL_URL ?? `${endpoint}/PowerShell`;
  testConnectivity({ endpoint, powershellUri: ps, ewsPath: "/EWS/Exchange.asmx", insecure: process.env.EXCHANGE_INSECURE === "true" }).then((r) => console.log(JSON.stringify(r, null, 2)));
}
