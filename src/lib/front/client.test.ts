import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listChannels, sendEmail } from "./client";

describe("Front client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.FRONT_API_TOKEN = "tok";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists channels", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ _results: [{ id: "cha_1", name: "Accounts", address: "accounts@fa.com", type: "smtp" }] })));
    const ch = await listChannels();
    expect(ch).toEqual([{ id: "cha_1", name: "Accounts", address: "accounts@fa.com", type: "smtp", is_valid: undefined }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api2.frontapp.com/channels");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("posts an email to the channel with html + text", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg_9" }), { status: 202 }));
    const r = await sendEmail({ channelId: "cha_1", to: ["david@fa.com"], subject: "S", html: "<b>hi</b>", text: "hi" });
    expect(r.messageId).toBe("msg_9");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api2.frontapp.com/channels/cha_1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["david@fa.com"], subject: "S", body: "<b>hi</b>", text: "hi", options: { archive: true } });
  });

  it("handles an empty 202 body and surfaces API errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 202 }));
    expect((await sendEmail({ channelId: "cha_1", to: ["x@y.z"], subject: "S", html: "h" })).messageId).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{"_error":{"message":"Unauthorized"}}', { status: 401 }));
    await expect(sendEmail({ channelId: "cha_1", to: ["x@y.z"], subject: "S", html: "h" })).rejects.toMatchObject({ status: 401 });
  });

  it("refuses to send with no recipients or no token", async () => {
    await expect(sendEmail({ channelId: "cha_1", to: [], subject: "S", html: "h" })).rejects.toThrow(/recipients/);
    delete process.env.FRONT_API_TOKEN;
    await expect(listChannels()).rejects.toThrow(/FRONT_API_TOKEN/);
  });
});
