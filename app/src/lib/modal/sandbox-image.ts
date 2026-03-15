// ---------------------------------------------------------------------------
// Modal Sandbox Image Configuration
// ---------------------------------------------------------------------------
// Declarative image specifications for each sandbox type. Each function
// returns an ImageConfig that describes the base image, dependencies,
// system packages, and file copies needed for that workload.
//
// These configs are consumed by `createSandbox()` in client.ts which
// translates them into the Modal API image specification format.
// ---------------------------------------------------------------------------

import type { ImageConfig } from "./types";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** Standard Python base image used across all sandbox types. */
const PYTHON_310_SLIM = "python:3.10-slim";

/** Common pip packages shared across research images. */
const COMMON_RESEARCH_PIP = [
  "pandas>=2.0,<3",
  "numpy>=1.24,<2",
  "scipy>=1.11,<2",
];

/** Common apt packages for builds that need compilation. */
const COMMON_BUILD_APT = [
  "build-essential",
  "gcc",
  "g++",
];

// ---------------------------------------------------------------------------
// Research image (hyperspace autoquant)
// ---------------------------------------------------------------------------

/**
 * Image configuration for hyperspace autoquant research runs.
 *
 * Includes Python 3.10, financial data libraries (yfinance, pandas, numpy),
 * and the hyperspace binary. This image is used by `launchResearchRun()`.
 *
 * The hyperspace binary is expected at `./bin/hyperspace` relative to the
 * repo root and is copied to `/usr/local/bin/hyperspace` inside the image.
 */
export function getResearchImage(): ImageConfig {
  return {
    baseImage: PYTHON_310_SLIM,
    pipPackages: [
      ...COMMON_RESEARCH_PIP,
      "yfinance>=0.2.28,<1",
      "requests>=2.31,<3",
      "tabulate>=0.9,<1",
    ],
    aptPackages: [
      "curl",
      "ca-certificates",
    ],
    copyCommands: [
      {
        src: "./bin/hyperspace",
        dst: "/usr/local/bin/hyperspace",
      },
      {
        src: "./autoresearch/hyperspace_alpha/loop.py",
        dst: "/app/loop.py",
      },
      {
        src: "./autoresearch/hyperspace_alpha/yahoo_india_loop.py",
        dst: "/app/yahoo_india_loop.py",
      },
    ],
    envVars: {
      PYTHONUNBUFFERED: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      HOME: "/root",
    },
  };
}

// ---------------------------------------------------------------------------
// India evaluation image
// ---------------------------------------------------------------------------

/**
 * Image configuration for Yahoo India equity evaluation runs.
 *
 * Lightweight image with only the data fetching and evaluation dependencies.
 * No heavy ML frameworks needed. Used by `launchIndiaRun()`.
 */
export function getEvaluationImage(): ImageConfig {
  return {
    baseImage: PYTHON_310_SLIM,
    pipPackages: [
      ...COMMON_RESEARCH_PIP,
      "yfinance>=0.2.28,<1",
      "requests>=2.31,<3",
      "tabulate>=0.9,<1",
    ],
    aptPackages: [
      "ca-certificates",
    ],
    copyCommands: [
      {
        src: "./autoresearch/hyperspace_alpha/yahoo_india_loop.py",
        dst: "/app/yahoo_india_loop.py",
      },
    ],
    envVars: {
      PYTHONUNBUFFERED: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  };
}

// ---------------------------------------------------------------------------
// Autoresearch image (LLM experiment loops)
// ---------------------------------------------------------------------------

/**
 * Image configuration for the autonomous LLM experiment loop.
 *
 * Heavyweight image with PyTorch, transformers, and the full autoresearch
 * dependency set. This powers `launchAutoresearchRun()` which runs the
 * agent-driven mutation / evaluation cycle.
 *
 * GPU-capable: the pip packages include CUDA-enabled PyTorch.
 */
export function getAutoresearchImage(): ImageConfig {
  return {
    baseImage: PYTHON_310_SLIM,
    pipPackages: [
      ...COMMON_RESEARCH_PIP,
      "torch>=2.1,<3",
      "transformers>=4.36,<5",
      "accelerate>=0.25,<1",
      "datasets>=2.16,<3",
      "tokenizers>=0.15,<1",
      "yfinance>=0.2.28,<1",
      "requests>=2.31,<3",
      "openai>=1.6,<2",
      "anthropic>=0.18,<1",
      "tiktoken>=0.5,<1",
      "tabulate>=0.9,<1",
      "scikit-learn>=1.3,<2",
      "matplotlib>=3.8,<4",
    ],
    aptPackages: [
      ...COMMON_BUILD_APT,
      "curl",
      "ca-certificates",
      "git",
    ],
    copyCommands: [
      {
        src: "./autoresearch/",
        dst: "/app/autoresearch/",
      },
      {
        src: "./bin/hyperspace",
        dst: "/usr/local/bin/hyperspace",
      },
    ],
    envVars: {
      PYTHONUNBUFFERED: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      TRANSFORMERS_CACHE: "/tmp/transformers_cache",
      HF_HOME: "/tmp/hf_home",
      HOME: "/root",
    },
  };
}

// ---------------------------------------------------------------------------
// Custom image builder
// ---------------------------------------------------------------------------

/**
 * Builds a custom ImageConfig by merging overrides onto a base image.
 *
 * Useful when a swarm or experiment needs additional packages or files
 * beyond the standard image templates.
 *
 * @param base - One of the standard image configs to extend.
 * @param overrides - Partial ImageConfig with additional packages/copies.
 * @returns A merged ImageConfig.
 */
export function extendImage(
  base: ImageConfig,
  overrides: Partial<ImageConfig>,
): ImageConfig {
  return {
    baseImage: overrides.baseImage ?? base.baseImage,
    pipPackages: [
      ...base.pipPackages,
      ...(overrides.pipPackages ?? []),
    ],
    aptPackages: [
      ...base.aptPackages,
      ...(overrides.aptPackages ?? []),
    ],
    copyCommands: [
      ...base.copyCommands,
      ...(overrides.copyCommands ?? []),
    ],
    envVars: {
      ...base.envVars,
      ...overrides.envVars,
    },
  };
}
