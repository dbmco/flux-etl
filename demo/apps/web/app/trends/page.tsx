'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const LineChart = dynamic(() => import('../../components/LineChart'), { ssr: false });
const BarChart = dynamic(() => import('../../components/BarChart'), { ssr: false });

const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    const hostname = window.location.hostname;
    if (hostname.includes('gitpod.dev')) {
      return `https://4000-${hostname.replace(/^3000-/, '')}`;
    }
  }
  return 'http://localhost:4000';
};

interface YearlyTrend {
  year: number;
  total_corrections: string;
  avg_lag_days: string;
}

interface TitleStat {
  title: number;
  correction_count: number;
  years_active: number;
  first_year: number;
  last_year: number;
  avg_lag_days: string;
}

export default function TrendsPage() {
  const [yearlyTrends, setYearlyTrends] = useState<YearlyTrend[]>([]);
  const [titleStats, setTitleStats] = useState<TitleStat[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = getApiUrl();

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/trends/yearly`).then(r => r.json()),
      fetch(`${API_URL}/api/trends/titles`).then(r => r.json())
    ])
      .then(([trendsData, titlesData]) => {
        setYearlyTrends(trendsData);
        setTitleStats(titlesData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch trends:', err);
        setLoading(false);
      });
  }, [API_URL]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading trends...</div>
      </div>
    );
  }

  const correctionsChartData = yearlyTrends.map(trend => ({
    date: trend.year.toString(),
    value: parseInt(trend.total_corrections)
  }));

  const lagDaysChartData = yearlyTrends.map(trend => ({
    date: trend.year.toString(),
    value: parseFloat(trend.avg_lag_days)
  }));

  const titleChartData = titleStats.slice(0, 10).map(stat => ({
    category: `Title ${stat.title}`,
    value: stat.correction_count
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Correction Trends</h1>
        <p className="mt-2 text-gray-600">
          Analyze regulatory correction patterns over time
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Years</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{yearlyTrends.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Corrections</dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {yearlyTrends.reduce((sum, t) => sum + parseInt(t.total_corrections), 0).toLocaleString()}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">CFR Titles</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{titleStats.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Yearly Corrections Chart */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Corrections Over Time
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Total regulatory corrections by year
          </p>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {correctionsChartData.length > 0 && (
            <LineChart
              data={correctionsChartData}
              valueLabel="Total Corrections"
              height={400}
            />
          )}
        </div>
      </div>

      {/* Average Lag Days Chart */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Average Correction Lag Time
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Average days between error occurrence and correction
          </p>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {lagDaysChartData.length > 0 && (
            <LineChart
              data={lagDaysChartData}
              valueLabel="Average Lag Days"
              height={400}
            />
          )}
        </div>
      </div>

      {/* Top CFR Titles Chart */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Top CFR Titles by Corrections
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Most frequently corrected CFR titles
          </p>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {titleChartData.length > 0 && (
            <BarChart
              data={titleChartData}
              valueLabel="Total Corrections"
              height={400}
            />
          )}
        </div>
      </div>

      {/* CFR Titles Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            CFR Title Statistics
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Corrections
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Years Active
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Lag Days
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {titleStats.slice(0, 15).map((stat) => (
                <tr key={stat.title} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">Title {stat.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{stat.correction_count.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{stat.years_active}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{stat.first_year} - {stat.last_year}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{parseFloat(stat.avg_lag_days).toFixed(1)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
