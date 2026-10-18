import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, acc);
    else if (/\.(js|html|css)$/.test(name)) acc.push(path);
  }
  return acc;
}

describe("public copy and privacy boundaries", () => {
  it("does not inject HTML, track people, or load remote fonts", () => {
    const source = files("src").map((path) => readFileSync(path, "utf8")).join("\n");
    const pages = ["index.html", "help.html", "privacy.html", "owner.html"]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const all = `${source}\n${pages}`;
    expect(all).not.toMatch(/innerHTML/);
    expect(all).not.toMatch(/document\.write/);
    expect(all).not.toMatch(/googletagmanager|google-analytics|fonts\.googleapis|gtag\(/i);
    expect(pages).not.toMatch(/type="email"/);
    expect(pages).not.toMatch(/2 business days/);
    expect(readFileSync("index.html", "utf8")).not.toMatch(/etsy/i);
    expect(readFileSync("help.html", "utf8")).not.toMatch(/etsy/i);
    expect(readFileSync("privacy.html", "utf8")).not.toMatch(/etsy/i);
  });

  it("sets a page policy that allows the license API and local files", () => {
    const shared = "default-src 'self'; script-src 'self'";
    const rest = "; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://api.lemonsqueezy.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";
    for (const page of ["help.html", "privacy.html"]) {
      expect(readFileSync(page, "utf8")).toContain(`${shared}${rest}`);
      expect(readFileSync(page, "utf8")).not.toContain("unsafe-eval");
    }
    for (const page of ["index.html", "owner.html"]) {
      expect(readFileSync(page, "utf8")).toContain(`${shared} 'unsafe-eval'${rest}`);
    }
  });

  it("tells the owner that pictures cannot be checked for QR codes", () => {
    const owner = readFileSync("owner.html", "utf8");
    expect(owner).toContain("Pictures can't be checked for QR codes");
    expect(owner).toMatch(/Etsy listings can't include a QR code/);
    expect(readFileSync("index.html", "utf8")).not.toContain("can't be checked for QR codes");
  });

  it("does not let the public deploy turn on the test checkout", () => {
    const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
    const vite = readFileSync("vite.config.js", "utf8");
    expect(deploy).toContain('VITE_LS_QA: ""');
    expect(deploy).not.toMatch(/VITE_LS_QA:\s*"1"/);
    expect(vite).toContain("Deploy GitHub Pages");
    expect(vite).toContain("VITE_LS_QA");
  });

  it("keeps checkout and test mode out of the PDF code", () => {
    const pdf = files("src/pdf").map((path) => readFileSync(path, "utf8")).join("\n");
    expect(pdf.toLowerCase()).not.toContain("lemonsqueezy");
    expect(pdf).not.toContain("Test mode");
    expect(pdf).not.toContain("purchaseUrl");
  });

  it("keeps the two-day promise and marketplace warning on the owner page only", () => {
    const owner = readFileSync("src/ui/owner-messages.js", "utf8");
    expect(owner).toMatch(/2 business days/);
    expect(owner).toMatch(/marketplace/i);
    expect(readFileSync("src/ui/messages.js", "utf8")).not.toMatch(/2 business days/);
  });
});
