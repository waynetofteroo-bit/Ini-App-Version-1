'use client';
import { useEffect, useRef } from 'react';
import type cytoscape from 'cytoscape';

interface GraphNode {
  id: string;
  label: string;
  bloom_ceiling: number;
  topic_tier: string;
  unit_id: string;
}

interface GraphEdge {
  id: string;
  from_node: string;
  to_node: string;
  relation: string;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  masteryMap: Record<string, number>;
}

function nodeColor(mastery: number | undefined): string {
  if (mastery === undefined) return '#d1d5db';
  if (mastery >= 0.7) return '#22c55e';
  if (mastery > 0) return '#f59e0b';
  return '#d1d5db';
}

export function CurriculumGraph({ nodes, edges, masteryMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;

    let cy: cytoscape.Core;

    import('cytoscape').then((Cytoscape) => {
      cy = Cytoscape.default({
        container: containerRef.current!,
        elements: [
          ...nodes.map((n) => ({
            data: {
              id: n.id,
              label: n.label,
              color: nodeColor(masteryMap[n.id]),
            },
          })),
          ...edges
            .filter((e) => e.relation === 'prerequisite')
            .map((e) => ({
              data: { id: e.id, source: e.from_node, target: e.to_node },
            })),
        ],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              label: 'data(label)',
              'font-size': '10px',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'text-margin-y': 4,
              width: 24,
              height: 24,
              color: '#374151',
            },
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#c7d2fe',
              'target-arrow-color': '#6366f1',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              width: 1.5,
            },
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          padding: 20,
        } as any,
      });
    });

    return () => {
      cy?.destroy();
    };
  }, [nodes, edges, masteryMap]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 500 }} />;
}
