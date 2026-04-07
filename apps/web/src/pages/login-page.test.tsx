import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { LoginPage } from "./login-page";

describe("LoginPage", () => {
  it("renders cinematic entry title", () => {
    localStorage.setItem("orbital-directive-locale", "en-US");
    render(
      <AppProviders>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <LoginPage />
        </BrowserRouter>
      </AppProviders>
    );

    expect(screen.getByText(/Enter mission command/i)).toBeTruthy();
  });
});
