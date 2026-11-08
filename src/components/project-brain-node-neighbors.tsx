import React from "react";
import { Button } from "ui/button";

export type ProjectBrainNeighbor = {
  id: string;
  label: string;
  factCount: number;
};

export function ProjectBrainNodeNeighbors({
  neighbors,
  onSelect,
}: {
  neighbors: ProjectBrainNeighbor[];
  onSelect: (nodeId: string) => void;
}) {
  if (!neighbors.length) return null;

  return (
    <section className="mt-2" aria-label="Related entities">
      <h5 className="text-xs font-medium">Related</h5>
      <ul className="mt-1 flex flex-wrap gap-1">
        {neighbors.map((neighbor) => (
          <li key={neighbor.id}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Open details for ${neighbor.label}`}
              onClick={() => onSelect(neighbor.id)}
            >
              {neighbor.label}
              <span className="ml-1 text-xs text-muted-foreground">
                {neighbor.factCount}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
