import { describe, expect, it } from "vitest";
import { buildServerPickerHtml } from "./server-picker-page.js";

describe("desktop server picker page", () => {
  it("uses the isolated picker bridge and displays escaped server values", () => {
    const html = buildServerPickerHtml({
      defaultUrl: 'https://void.example</script><script>alert("x")</script>',
      previousUrl: 'https://own.example" autofocus onfocus="alert(1)',
      allowLocalHttp: false,
    });
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("window.serverPicker.choose(choice)");
    expect(html).not.toContain("window.desktop.");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("&quot; autofocus onfocus=&quot;");
    expect(html).toContain("const allowLocalHttp=false");
  });

  it("offers custom server selection while defaulting to the configured target", () => {
    const html = buildServerPickerHtml({
      defaultUrl: "https://void.example",
      previousUrl: "https://self-hosted.example",
      allowLocalHttp: true,
    });
    expect(html).toContain('value="default" checked');
    expect(html).toContain('value="custom"');
    expect(html).toContain('value="https://self-hosted.example"');
    expect(html).toContain('mode:"custom",url:url.value,allowLocalHttp');
  });
});
