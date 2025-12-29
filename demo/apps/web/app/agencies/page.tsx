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

interface Agency {
  slug: string;
  name: string;
  short_name: string;
  total_cfr_references: number;
  child_count: number;
}

interface AgencyMetrics extends Agency {
  total_corrections: number;
  rvi: string;
}

type SortField = 'name' | 'total_corrections' | 'rvi' | 'total_cfr_references';
type SortDirection = 'asc' | 'desc';

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<AgencyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('total_corrections');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const API_URL = getApiUrl();

  useEffect(() => {
    fetch(`${API_URL}/api/agencies/top/corrections?limit=100`)
      .then(r => r.json())
      .then(data => {
        setAgencies(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch agencies:', err);
        setLoading(false);
      });
  }, [API_URL]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSorted = agencies
    .filter(agency => 
      agency.name.toLowerCase().includes(search.toLowerCase()) ||
      (agency.short_name && agency.short_name.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      let aVal: number | string = a[sortField];
      let bVal: number | string = b[sortField];

      if (sortField === 'rvi') {
        aVal = parseFloat(a.rvi);
        bVal = parseFloat(b.rvi);
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading agencies...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Federal Agencies</h1>
        <p className="mt-2 text-gray-600">
          Browse all federal agencies tracked in the eCFR system
        </p>
      </div>

      {/* Search */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
          <svg
            className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Showing {filteredAndSorted.length} of {agencies.length} agencies
        </p>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Agency</span>
                    {sortField === 'name' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('total_corrections')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Corrections</span>
                    {sortField === 'total_corrections' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('rvi')}
                >
                  <div className="flex items-center space-x-1">
                    <span>RVI</span>
                    {sortField === 'rvi' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('total_cfr_references')}
                >
                  <div className="flex items-center space-x-1">
                    <span>CFR Refs</span>
                    {sortField === 'total_cfr_references' && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSorted.map((agency) => (
                <tr key={agency.slug} className="hover:bg-gray-50">
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {agency.total_corrections.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {parseFloat(agency.rvi).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {agency.total_cfr_references}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/agencies/${agency.slug}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900">About RVI (Regulatory Volatility Index)</h3>
        <p className="mt-1 text-sm text-blue-700">
          RVI measures how frequently an agency modifies its regulations relative to its regulatory footprint. 
          Formula: (Total Corrections / CFR References) × 100. Higher values indicate more frequent regulatory changes.
        </p>
      </div>
    </div>
  );
}
