import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../ctx";
import { Logo } from "../components/Layout";
import type { User } from "../types";

const blurb: Record<string, string> = {
  creator: "Submit drafts, read cited findings, accept fixes or dispute them, then send to a reviewer.",
  reviewer: "Open the review queue, check the tracked changes and evidence, approve or request changes.",
  manager: "Everything a reviewer can do, plus final sign-off and the knowledge base (guidelines, facts, terms).",
  admin: "Workspace admin with the same powers as a manager, including resetting the demo data.",
};

export default function Login() {
  const { login, toast } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api.get<User[]>("/api/users").then(setUsers).catch(() => toast("Cannot reach the server.", "err")); }, []);
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center"><Logo /></div>
        <h1 className="font-head text-3xl font-bold leading-tight">Check content against your brand rules before it goes live</h1>
        <p className="mx-auto mt-3 max-w-2xl text-ink/75">Plumbline compares a draft with your approved guidelines, facts and terms, explains every issue with its source, and leaves the final call to people.</p>
      </div>
      <div className="card p-5">
        <h2 className="font-head text-lg font-semibold">Open the demo workspace</h2>
        <p className="mb-4 text-sm text-ink/70">Pick an account. No password is needed. Try <b>Priya (creator)</b> first, then switch to <b>Arjun</b> and <b>Meera</b> to see the review and sign-off steps.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {users.map((u) => (
            <button key={u.id} onClick={() => login(u.id).catch((e) => toast(e.message, "err"))}
              className="rounded-xl border border-ink/15 bg-white p-4 text-left transition hover:border-teal hover:shadow-md">
              <div className="flex items-center justify-between"><span className="font-head font-semibold">{u.name}</span>
                <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-bold capitalize">{u.role}</span></div>
              <div className="text-sm text-ink/60">{u.title}</div>
              <p className="mt-2 text-sm text-ink/80">{blurb[u.role]}</p>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink/55">Demo workspace: a fictional skincare brand called Lumora. All guidelines, facts and sample drafts are invented.</p>
      </div>
    </div>
  );
}
