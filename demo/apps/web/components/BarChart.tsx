'use client';

import { useEffect, useRef } from 'react';
import * as am4core from '@amcharts/amcharts4/core';
import * as am4charts from '@amcharts/amcharts4/charts';
import am4themes_animated from '@amcharts/amcharts4/themes/animated';

am4core.useTheme(am4themes_animated);

interface BarChartProps {
  data: Array<{
    category: string;
    value: number;
    color?: string;
  }>;
  title?: string;
  valueLabel?: string;
  height?: number;
}

export default function BarChart({ data, title, valueLabel = 'Value', height = 400 }: BarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<am4charts.XYChart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Create chart
    const chart = am4core.create(chartRef.current, am4charts.XYChart);
    chart.data = data;

    // Create axes
    const categoryAxis = chart.yAxes.push(new am4charts.CategoryAxis());
    categoryAxis.dataFields.category = 'category';
    categoryAxis.renderer.grid.template.location = 0;
    categoryAxis.renderer.minGridDistance = 20;
    categoryAxis.renderer.labels.template.fontSize = 12;
    categoryAxis.renderer.labels.template.truncate = true;
    categoryAxis.renderer.labels.template.maxWidth = 200;

    const valueAxis = chart.xAxes.push(new am4charts.ValueAxis());
    valueAxis.title.text = valueLabel;
    valueAxis.title.fontSize = 14;
    valueAxis.renderer.minGridDistance = 50;

    // Create series
    const series = chart.series.push(new am4charts.ColumnSeries());
    series.dataFields.valueX = 'value';
    series.dataFields.categoryY = 'category';
    series.name = valueLabel;
    series.columns.template.tooltipText = '{categoryY}: [bold]{valueX}[/]';
    series.columns.template.fillOpacity = 0.8;
    series.columns.template.strokeWidth = 0;

    // Color by data point if provided
    series.columns.template.adapter.add('fill', (fill, target) => {
      const dataItem = target.dataItem as any;
      if (dataItem && dataItem.dataContext && dataItem.dataContext.color) {
        return am4core.color(dataItem.dataContext.color);
      }
      return fill;
    });

    // Add cursor
    chart.cursor = new am4charts.XYCursor();
    chart.cursor.behavior = 'zoomY';

    // Add title if provided
    if (title) {
      const chartTitle = chart.titles.create();
      chartTitle.text = title;
      chartTitle.fontSize = 18;
      chartTitle.fontWeight = '600';
      chartTitle.marginBottom = 20;
    }

    chartInstance.current = chart;

    return () => {
      chart.dispose();
    };
  }, [data, title, valueLabel]);

  return <div ref={chartRef} style={{ width: '100%', height: `${height}px` }} />;
}
