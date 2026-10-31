
"use client";

import React, { useState } from "react";

const Page = () => {
  const [jamCode, setJamCode] = useState("");

  const isValid = jamCode.length === 6;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">

        <h1 className="mb-2 text-center text-3xl font-bold">
          Welcome to JAM
        </h1>

        <p className="mb-8 text-center text-sm text-neutral-400">
          Join your friends or create a new room.
        </p>

        <div className="space-y-4">

          <input
            type="text"
            inputMode="numeric"
            placeholder="Enter 6-digit JAM code"
            value={jamCode}
            maxLength={6}
            onChange={(e) =>
              setJamCode(e.target.value.replace(/\D/g, ""))
            }
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-white outline-none placeholder:text-neutral-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />

          <button
            disabled={!isValid}
            className="w-full rounded-lg bg-violet-600 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            Join Room
          </button>

        </div>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-neutral-700" />
          <span className="text-xs text-neutral-500">OR</span>
          <div className="h-px flex-1 bg-neutral-700" />
        </div>

        <button className="w-full rounded-lg border border-neutral-700 py-3 font-semibold transition hover:border-violet-500 hover:bg-neutral-800">
          + Create a Room
        </button>

      </div>
    </main>
  );
};

export default Page;
