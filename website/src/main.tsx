import React from "react";
import ReactDOM from "react-dom/client";
import "./site.css";
import "../../src/App.css";
import { LandingPage } from "./LandingPage";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>,
);
