"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectDatabaseAction } from "./connect-database-action";
import type { SavedConnectionValues } from "@/lib/connection-keychain";

function Field({
  id,
  label,
  required,
  defaultValue,
  ...inputProps
}: { id: string; label: string; required?: boolean } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm text-black">
        {label} {required ? <span className="text-red-600">*</span> : null}{" "}
        <span className="text-black/40">{required ? "(Required)" : "(Optional)"}</span>
      </label>
      <Input id={id} name={id} defaultValue={defaultValue} {...inputProps} />
    </div>
  );
}

export function ConnectionForm({ savedValues }: { savedValues: SavedConnectionValues }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setConnecting(true);
    setError(null);
    const result = await connectDatabaseAction(formData);
    if (!result.ok) {
      setConnecting(false);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <Field
        id="databaseUrl"
        label="Database URL"
        required
        type="password"
        placeholder="e.g., postgresql://user:password@localhost:5432/mydatabase"
        defaultValue={savedValues.databaseUrl}
      />
      <Field
        id="storageBucket"
        label="Storage Bucket Name"
        placeholder="e.g., global-knowledge-assets"
        defaultValue={savedValues.storageBucket}
      />
      <Field
        id="storageAccessKeyId"
        label="Access Key ID"
        placeholder="e.g., AKIA1234567890EXAMPLE"
        defaultValue={savedValues.storageAccessKeyId}
      />
      <Field
        id="storageSecretAccessKey"
        label="Secret Access Key"
        type="password"
        placeholder="········"
        defaultValue={savedValues.storageSecretAccessKey}
      />
      <Field
        id="storageEndpoint"
        label="Storage Endpoint"
        placeholder="e.g., https://s3.us-east-1.amazonaws.com"
        defaultValue={savedValues.storageEndpoint}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
        <Button type="button" variant="outline" onClick={() => formRef.current?.reset()}>
          Clear
        </Button>
        <Button type="submit" disabled={connecting}>
          {connecting ? "Connecting…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
