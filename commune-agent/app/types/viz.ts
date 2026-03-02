export type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
};

export type TableViz = {
  type: "table";
  title?: string;
  columns: TableColumn[];
  rows: Record<string, string | number | null>[];
  caption?: string;
};

export type BarChartViz = {
  type: "bar_chart";
  title?: string;
  labels: string[];
  values: number[];
  unit?: string;
};

export type LineChartViz = {
  type: "line_chart";
  title?: string;
  series: {
    label: string;
    data: { x: number | string; y: number }[];
  }[];
  x_label?: string;
  y_label?: string;
  unit?: string;
};

export type PieChartViz = {
  type: "pie_chart";
  title?: string;
  slices: { label: string; value: number }[];
  unit?: string;
};

export type VizData = TableViz | BarChartViz | LineChartViz | PieChartViz;
