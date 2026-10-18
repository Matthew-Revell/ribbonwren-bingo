import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

/**
 * Same decision as the deploy job if. The workflow expression is the gate
 * that runs before checkout. This copy is here so the cases can be checked
 * without GitHub, and the test below requires the YAML to say the same thing.
 */
export function deployAllowed({ eventName, ref, repository, workflowRun }) {
  const manual = eventName === "workflow_dispatch" && ref === "refs/heads/main";
  const run = workflowRun || {};
  const testedPush = eventName === "workflow_run"
    && run.conclusion === "success"
    && run.event === "push"
    && run.headRepository === repository
    && run.headBranch === "main";
  return manual || testedPush;
}

describe("pages deploy guard", () => {
  it("keeps the fork refusal in the workflow expression", () => {
    expect(workflow).toMatch(/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.event == 'push'/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.head_branch == 'main'/);
    expect(workflow).toMatch(/fork whose branch is also named main/);
  });

  it("deploys a green push to this repo's main, and a manual run of main", () => {
    const repository = "Matthew-Revell/ribbonwren-bingo";
    expect(deployAllowed({
      eventName: "workflow_run",
      repository,
      workflowRun: {
        conclusion: "success",
        event: "push",
        headRepository: repository,
        headBranch: "main",
      },
    })).toBe(true);
    expect(deployAllowed({
      eventName: "workflow_dispatch",
      ref: "refs/heads/main",
      repository,
    })).toBe(true);
  });

  it("refuses a fork main, a pull request, another branch, and a failed run", () => {
    const repository = "Matthew-Revell/ribbonwren-bingo";
    const fork = "someone/ribbonwren-bingo";
    expect(deployAllowed({
      eventName: "workflow_run",
      repository,
      workflowRun: {
        conclusion: "success",
        event: "pull_request",
        headRepository: fork,
        headBranch: "main",
      },
    })).toBe(false);
    expect(deployAllowed({
      eventName: "workflow_run",
      repository,
      workflowRun: {
        conclusion: "success",
        event: "push",
        headRepository: fork,
        headBranch: "main",
      },
    })).toBe(false);
    expect(deployAllowed({
      eventName: "workflow_run",
      repository,
      workflowRun: {
        conclusion: "success",
        event: "push",
        headRepository: repository,
        headBranch: "feature",
      },
    })).toBe(false);
    expect(deployAllowed({
      eventName: "workflow_run",
      repository,
      workflowRun: {
        conclusion: "failure",
        event: "push",
        headRepository: repository,
        headBranch: "main",
      },
    })).toBe(false);
    expect(deployAllowed({
      eventName: "workflow_dispatch",
      ref: "refs/heads/feature",
      repository,
    })).toBe(false);
    expect(deployAllowed({
      eventName: "workflow_dispatch",
      ref: "refs/tags/v1",
      repository,
    })).toBe(false);
  });
});
