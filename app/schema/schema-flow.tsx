"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SchemaGraph, SchemaField } from "@/lib/schema-graph";

type ModelNodeData = { label: string; fields: SchemaField[] };
type ModelNode = Node<ModelNodeData, "model">;

function ModelNode({ data }: NodeProps<ModelNode>) {
  return (
    <div className="min-w-[220px] overflow-hidden rounded-lg border border-black/15 bg-white shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <div className="border-b border-black/10 bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
        {data.label}
      </div>
      <ul className="divide-y divide-black/5">
        {data.fields.map((field) => (
          <li key={field.name} className="flex items-baseline justify-between gap-4 px-3 py-1 text-xs">
            <span className="font-medium text-black/80">{field.name}</span>
            <span className="text-black/45">{field.type}</span>
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
    </div>
  );
}

const nodeTypes = { model: ModelNode };

export function SchemaFlow({ graph }: { graph: SchemaGraph }) {
  const nodes = useMemo<Node[]>(
    () => graph.nodes.map((node) => ({ ...node, type: "model" })),
    [graph.nodes],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        animated: true,
        style: { stroke: "#2563eb" },
        labelStyle: { fontSize: 11, fill: "#6b7280" },
      })),
    [graph.edges],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
