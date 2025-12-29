'use client';

import { useEffect, useRef } from 'react';
import * as am4core from '@amcharts/amcharts4/core';
import * as am4charts from '@amcharts/amcharts4/charts';
import am4themes_animated from '@amcharts/amcharts4/themes/animated';

am4core.useTheme(am4themes_animated);

interface LineChartProps {
  data: Array<{
    date: string | number;
    value: number;
    [key: string]: any;
  }>;
  title?: string;
  valueLabel?: string;
  dateField?: string;
  valueField?: string;
  height?: number;
}

export default function LineChart({ 
  data, 
  title, 
  valueLabel = 'Value',
  dateField = 'date',
  valueField = 'value',
  height = 400 
}: LineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<am4charts.XYChart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Create chart
    const chart = am4core.create(chartRef.current, am4charts.XYChart);
    chart.data = data;

    // Create axes
    const dateAxis = chart.xAxes.push(new am4charts.CategoryAxis());
    dateAxis.dataFields.category = dateField;
    dateAxis.renderer.grid.template.location = 0;
    dateAxis.renderer.minGridDistance = 50;
    dateAxis.renderer.labels.template.fontSize = 12;

    const valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
    valueAxis.title.text = valueLabel;
    valueAxis.title.fontSize = 14;

    // Create series
    const series = chart.series.push(new am4charts.LineSeries());
    series.dataFields.valueY = valueField;
    series.dataFields.categoryX = dateField;
    series.name = valueLabel;
    series.strokeWidth = 3;
    series.tensionX = 0.8;
    series.tooltipText = '{categoryX}: [bold]{valueY}[/]';

    // Add bullets
    const bullet = series.bullets.push(new am4charts.CircleBullet());
    bullet.circle.strokeWidth = 2;
    bullet.circle.radius = 4;
    bullet.circle.fill = am4core.color('#fff');

    // Add cursor
    chart.cursor = new am4charts.XYCursor();
    chart.cursor.behavior = 'zoomXY';
    chart.cursor.xAxis = dateAxis;

    // Add scrollbar
    chart.scrollbarX = new am4core.Scrollbar();

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
  }, [data, title, valueLabel, dateField, valueField]);

  return <div ref={chartRef} style={{ width: '100%', height: `${height}px` }} />;
}
