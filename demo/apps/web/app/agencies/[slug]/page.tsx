'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
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

interface AgencyDetail {
  slug: string;
  name: string;
  short_name: string;
  parent_slug: string | null;
  total_cfr_references: number;
  child_count: number;
  total_corrections: number;
  rvi: string;
  avg_lag_days: string;
  first_correction_year: number;
  last_correction_year: number;
}

interface Correction {
  ecfr_id: number;
  cfr_reference: string;
  title: number;
  corrective_action: string;
  error_occurred: string;
  error_corrected: string;
  lag_days: number;
  year: number;
}

export default function AgencyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [agency, setAgency] = useState<AgencyDetail | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = getApiUrl();

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/agencies/${slug}`).then(r => r.json()),
      fetch(`${API_URL}/api/corrections?limit=10`).then(r => r.json())
    ])
      .then(([agencyData, correctionsData]) => {
        setAgency(agencyData);
        setCorrections(correctionsData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch agency data:', err);
        setLoading(false);
      });
  }, [slug, API_URL]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading agency details...</div>
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Agency Not Found</h2>
        <p className="mt-2 text-gray-600">The agency you're looking for doesn't exist.</p>
        <Link href="/agencies" className="mt-4 inline-block text-blue-600 hover:text-blue-800">
          ← Back to Agencies
        </Link>
      </div>
    );
  }

  const correctionsByYear = corrections.reduce((acc, correction) => {
    const year = correction.year.toString();
    acc[year] = (acc[year] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(correctionsByYear).map(([year, count]) => ({
    category: year,
    value: count
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          <li>
            <Link href="/agencies" className="text-gray-500 hover:text-gray-700">
              Agencies
            </Link>
          </li>
          <li>
            <span className="text-gray-400">/</span>
          </li>
          <li>
            <span className="text-gray-900 font-medium">{agency.name}</span>
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{agency.name}</h1>
        {agency.short_name && (
          <p className="mt-1 text-lg text-gray-600">{agency.short_name}</p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  <dd className="text-3xl font-semibold text-gray-900">{agency.total_corrections.toLocaleString()}</dd>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">RVI</dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {parseFloat(agency.rvi).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                  <dt className="text-sm font-medium text-gray-500 truncate">CFR References</dt>
                  <dd className="text-3xl font-semibold text-gray-900">{agency.total_cfr_references}</dd>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Lag Days</dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {parseFloat(agency.avg_lag_days).toFixed(0)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Corrections by Year
            </h3>
          </div>
          <div className="px-4 py-5 sm:p-6">
            <BarChart
              data={chartData}
              valueLabel="Corrections"
              height={300}
            />
          </div>
        </div>
      )}

      {/* Recent Corrections */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Recent Corrections
          </h3>
        </div>
        <div className="px-4 py-5 sm:p-6">
          <div className="space-y-4">
            {corrections.slice(0, 5).map((correction) => (
              <div key={correction.ecfr_id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{correction.cfr_reference}</p>
                    <p className="text-sm text-gray-600 mt-1">{correction.corrective_action}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(correction.error_corrected).toLocaleDateString()} • {correction.lag_days} day lag
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {correction.year}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link
              href="/corrections"
              className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              View All Corrections
            </Link>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Active Period</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {agency.first_correction_year} - {agency.last_correction_year}
            </dd>
          </div>
          {agency.child_count > 0 && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Sub-Agencies</dt>
              <dd className="mt-1 text-sm text-gray-900">{agency.child_count}</dd>
            </div>
          )}
          {agency.parent_slug && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Parent Agency</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <Link href={`/agencies/${agency.parent_slug}`} className="text-blue-600 hover:text-blue-800">
                  View Parent
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
