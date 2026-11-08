import { expect, test } from "bun:test";
import { publicOrigin } from "./public-url";

test("only a bare http(s) origin is accepted", () => {
  expect(publicOrigin("https://music.example.com")).toBe("https://music.example.com");
  expect(publicOrigin("http://192.168.1.5:8080")).toBe("http://192.168.1.5:8080");
  expect(publicOrigin("http://[::1]:8080")).toBe("http://[::1]:8080");
  expect(publicOrigin("HTTPS://Music.Example")).toBe("https://music.example");
});

test("a port out of range, a broken address, a login, a path or a query are all refused", () => {
  for (const bad of [
    "https://x.example:99999",
    "http://[::1",
    "https://user:pw@evil.example",
    "https://x.example/app",
    "https://x.example?a=1",
    "https://x.example#a",
    "https://x.example:443",
    "ftp://x.example",
    "javascript:alert(1)",
    "music.example",
  ])
    expect(publicOrigin(bad)).toBeNull();
});
