'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const BarChart = dynamic(() => import('../../../components/BarChart'), { ssr: false });

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

interface AgencyWordCount {
  slug: string;
  name: string;
  short_name: string;
  word_count_estimate: number;
  total_corrections: number;
  rvi: string;
  total_cfr_references: number;
}

export default function WordCountReportPage() {
  const [agencies, setAgencies] = useState<AgencyWordCount[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = getApiUrl();

  useEffect(() => {
    fetch(`${API_URL}/api/reports/word-count`)
      .then(r => r.json())
      .then(data => {
        setAgencies(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch word count report:', err);
        setLoading(false);
      });
  }, [API_URL]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  const totalWords = agencies.reduce((sum, a) => sum + a.word_count_estimate, 0);
  const avgWords = Math.round(totalWords / agencies.length);

  const chartData = agencies.slice(0, 15).map(agency => ({
    category: agency.short_name || agency.name.substring(0, 30),
    value: agency.word_count_estimate
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Word Count by Agency Report</h1>
        <p className="mt-2 text-gray-600">
          Estimated regulatory text volume by federal agency
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Words</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{totalWords.toLocaleString()}</dd>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Average per Agency</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{avgWords.toLocaleString()}</dd>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Agencies Tracked</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{agencies.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Top 15 Agencies by Estimated Word Count
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Regulatory text volume based on CFR references
          </p>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {chartData.length > 0 && (
            <BarChart
              data={chartData}
              valueLabel="Estimated Words"
              height={500}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            All Agencies - Word Count Report
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agency
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Est. Words
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CFR Refs
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Corrections
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  RVI
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agencies.map((agency, index) => (
                <tr key={agency.slug} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    #{index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900">
                        {agency.name}
                      </div>
                      {agency.short_name && (
                        <div className="text-sm text-gray-500">
                          {agency.short_name}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {agency.word_count_estimate.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {agency.total_cfr_references}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {agency.total_corrections.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {parseFloat(agency.rvi).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/agencies/${agency.slug}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900">Estimation Methodology</h3>
        <p className="mt-1 text-sm text-blue-700">
          Word counts are estimated based on CFR reference specificity:
        </p>
        <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
          <li><strong>Title-level references:</strong> ~50,000 words (entire CFR title)</li>
          <li><strong>Chapter-level references:</strong> ~10,000 words</li>
          <li><strong>Part-level references:</strong> ~2,000 words</li>
          <li><strong>Section-level references:</strong> ~500 words</li>
        </ul>
        <p className="mt-2 text-sm text-blue-700">
          These estimates provide relative comparison between agencies. Actual word counts may vary.
        </p>
      </div>
    </div>
  );
}
