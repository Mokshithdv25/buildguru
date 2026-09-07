import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import LocationAutocomplete from "./LocationAutocomplete";

global.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
function Harness() {
  const [value, setValue] = useState("");
  return <LocationAutocomplete value={value} onChange={setValue} required />;
}
function type(value) {
  const input = container.querySelector("input");
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
async function search() {
  await act(async () => { jest.advanceTimersByTime(450); });
}
beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn();
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
  delete global.fetch;
});
const result = { features: [{ properties: { name: "Whitefield", county: "Bangalore East", state: "Karnataka", countrycode: "IN" } }] };
test("debounces requests and selects a live locality using the keyboard", async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => result });
  const input = type("Wh");
  await search();
  expect(fetch).not.toHaveBeenCalled();
  type("Whitefield");
  expect(fetch).not.toHaveBeenCalled();
  await search();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="option"]').textContent).toContain("Whitefield");
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(input.getAttribute("aria-activedescendant")).toBe("project-location-option-0");
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(input.value).toBe("Whitefield, Bangalore East, Karnataka");
  expect(input.getAttribute("aria-expanded")).toBe("false");
});
test("keeps manual input and fallback city choices when the provider fails", async () => {
  fetch.mockRejectedValue(new Error("offline"));
  const input = type("Pune");
  await search();
  expect(container.textContent).toContain("Live search is unavailable");
  expect(container.querySelector('[role="option"]').textContent).toContain("Pune");
  expect(input.value).toBe("Pune");
});
test("ignores an old response after the query changes", async () => {
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  type("Whitefield");
  await search();
  type("Hyderabad");
  await act(async () => resolveOld({ ok: true, json: async () => result }));
  expect(container.textContent).not.toContain("Whitefield");
  expect(container.querySelector("input").value).toBe("Hyderabad");
});
