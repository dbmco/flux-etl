'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

interface AgencyScorecard {
  slug: string;
  name: string;
  short_name: string;
  total_corrections: number;
  rvi: string;
  word_count_estimate: number;
  avg_correction_lag_days: string;
  total_cfr_references: number;
  corrections_rank: number;
  rvi_rank: number;
  size_rank: number;
  responsiveness_rank: number;
  composite_score: string;
  activity_grade: string;
}

const getGradeColor = (grade: string) => {
  switch (grade) {
    case 'A': return 'bg-green-100 text-green-800';
    case 'B': return 'bg-blue-100 text-blue-800';
    case 'C': return 'bg-yellow-100 text-yellow-800';
    case 'D': return 'bg-orange-100 text-orange-800';
    case 'F': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getRankBadge = (rank: number, total: number) => {
  const percentile = (rank / total) * 100;
  if (percentile <= 20) return { color: 'text-green-600', label: 'Top 20%' };
  if (percentile <= 40) return { color: 'text-blue-600', label: 'Top 40%' };
  if (percentile <= 60) return { color: 'text-yellow-600', label: 'Middle' };
  if (percentile <= 80) return { color: 'text-orange-600', label: 'Bottom 40%' };
  return { color: 'text-red-600', label: 'Bottom 20%' };
};

export default function ScorecardPage() {
  const [agencies, setAgencies] = useState<AgencyScorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortState, setSortState] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'composite', dir: 'desc' });

  const API_URL = getApiUrl();

  useEffect(() => {
    fetch(`${API_URL}/api/reports/scorecard`)
      .then(r => r.json())
      .then(data => {
        setAgencies(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch scorecard:', err);
        setLoading(false);
      });
  }, [API_URL]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading scorecard...</div>
      </div>
    );
  }

  const sortedAgencies = [...agencies].sort((a, b) => {
    const { key, dir } = sortState;
    const multiplier = dir === 'asc' ? 1 : -1;

    const cmp = (x: number | string, y: number | string) => {
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * multiplier;
      return String(x).localeCompare(String(y)) * multiplier;
    };

    switch (key) {
      case 'corrections':
        return cmp(a.corrections_rank, b.corrections_rank);
      case 'rvi':
        return cmp(a.rvi_rank, b.rvi_rank);
      case 'responsiveness':
        return cmp(a.responsiveness_rank, b.responsiveness_rank);
      case 'size':
        return cmp(a.size_rank, b.size_rank);
      case 'agency':
        return cmp(a.name, b.name);
      case 'composite':
      default:
        return cmp(parseFloat(a.composite_score), parseFloat(b.composite_score));
    }
  });

  const totalAgencies = agencies.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Agency Scorecard</h1>
        <p className="mt-2 text-gray-600">
          Multi-dimensional ranking of federal agencies based on regulatory activity
        </p>
      </div>

      {/* Methodology Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Scorecard Methodology</h3>
        <p className="text-sm text-blue-800 mb-4">
          Agencies are ranked across four key dimensions to create a composite score:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              <h4 className="font-medium text-gray-900">Correction Activity (30%)</h4>
            </div>
            <p className="text-sm text-gray-600">Total number of regulatory corrections made</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
              <h4 className="font-medium text-gray-900">Volatility (25%)</h4>
            </div>
            <p className="text-sm text-gray-600">RVI - frequency of changes relative to size</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              <h4 className="font-medium text-gray-900">Regulatory Size (20%)</h4>
            </div>
            <p className="text-sm text-gray-600">Estimated word count of regulations</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
              <h4 className="font-medium text-gray-900">Responsiveness (25%)</h4>
            </div>
            <p className="text-sm text-gray-600">Average time to correct errors (lower is better)</p>
          </div>
        </div>
      </div>

      {/* Sort Controls (kept for backward compatibility, but headers are clickable) */}
      <div className="bg-white shadow rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sort: <span className="font-semibold">{sortState.key}</span> ({sortState.dir})
        </label>
        <div className="text-sm text-gray-600">You can also click column headers to change sort and toggle direction.</div>
      </div>

      {/* Scorecard Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {/** Rank uses composite sort value visually */}
                          <button
                            onClick={() => setSortState(s => ({ key: 'composite', dir: s.key === 'composite' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                            className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              sortState.key === 'composite' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                            aria-sort={sortState.key === 'composite' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                          >
                            Rank
                            {sortState.key === 'composite' && (
                              sortState.dir === 'desc' ? (
                                <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path d="M5 8l5 5 5-5H5z" />
                                </svg>
                              ) : (
                                <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path d="M5 12l5-5 5 5H5z" />
                                </svg>
                              )
                            )}
                          </button>
                        </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'agency', dir: s.key === 'agency' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'agency' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'agency' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Agency
                    {sortState.key === 'agency' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'composite', dir: s.key === 'composite' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'composite' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'composite' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Score
                    {sortState.key === 'composite' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'corrections', dir: s.key === 'corrections' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'corrections' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'corrections' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Activity
                    {sortState.key === 'corrections' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'rvi', dir: s.key === 'rvi' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'rvi' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'rvi' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Volatility
                    {sortState.key === 'rvi' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'size', dir: s.key === 'size' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'size' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'size' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Size
                    {sortState.key === 'size' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={() => setSortState(s => ({ key: 'responsiveness', dir: s.key === 'responsiveness' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      sortState.key === 'responsiveness' ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    aria-sort={sortState.key === 'responsiveness' ? (sortState.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  >
                    Response
                    {sortState.key === 'responsiveness' && (
                      sortState.dir === 'desc' ? (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 8l5 5 5-5H5z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M5 12l5-5 5 5H5z" />
                        </svg>
                      )
                    )}
                  </button>
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedAgencies.map((agency, index) => {
                const activityBadge = getRankBadge(agency.corrections_rank, totalAgencies);
                const rviBadge = getRankBadge(agency.rvi_rank, totalAgencies);
                const sizeBadge = getRankBadge(agency.size_rank, totalAgencies);
                const responseBadge = getRankBadge(agency.responsiveness_rank, totalAgencies);

                return (
                  <tr key={agency.slug} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
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
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getGradeColor(agency.activity_grade)}`}>
                        {agency.activity_grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                      {parseFloat(agency.composite_score).toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-xs">
                        <div className={`font-medium ${activityBadge.color}`}>
                          #{agency.corrections_rank}
                        </div>
                        <div className="text-gray-500">{activityBadge.label}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-xs">
                        <div className={`font-medium ${rviBadge.color}`}>
                          #{agency.rvi_rank}
                        </div>
                        <div className="text-gray-500">{rviBadge.label}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-xs">
                        <div className={`font-medium ${sizeBadge.color}`}>
                          #{agency.size_rank}
                        </div>
                        <div className="text-gray-500">{sizeBadge.label}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-xs">
                        <div className={`font-medium ${responseBadge.color}`}>
                          #{agency.responsiveness_rank}
                        </div>
                        <div className="text-gray-500">{responseBadge.label}</div>
                      </div>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-900">Key Insights</h3>
        <ul className="mt-2 text-sm text-yellow-800 space-y-1 list-disc list-inside">
          <li><strong>High composite scores</strong> indicate agencies with significant regulatory activity and impact</li>
          <li><strong>Grade A agencies</strong> are in the top 20% for correction activity</li>
          <li><strong>Responsiveness ranking</strong> shows how quickly agencies fix errors (lower rank = faster response)</li>
          <li><strong>Use this scorecard</strong> to prioritize monitoring efforts and resource allocation</li>
        </ul>
      </div>
    </div>
  );
}
