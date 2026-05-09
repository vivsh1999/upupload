import { bench, describe } from "vitest";
import { emptyResult, artifact, warning, infoMessage } from "./result";

describe("result helpers", () => {
  bench("emptyResult", () => {
    emptyResult();
  });

  bench("artifact", () => {
    artifact("thumb", new Blob(["x"]), "thumb.jpg", "image/jpeg");
  });

  bench("warning", () => {
    warning("warn message", "CODE");
  });

  bench("infoMessage", () => {
    infoMessage("info message", "CODE");
  });
});
