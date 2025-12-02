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

export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterTitle, setFilterTitle] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const API_URL = getApiUrl();
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setLoading(true);
    
    let url = `${API_URL}/api/corrections?limit=${ITEMS_PER_PAGE}&offset=${(page - 1) * ITEMS_PER_PAGE}`;
    if (filterYear) url += `&year=${filterYear}`;
    if (filterTitle) url += `&title=${filterTitle}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        setCorrections(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch corrections:', err);
        setLoading(false);
      });
  }, [API_URL, page, filterYear, filterTitle]);

  const filteredCorrections = corrections.filter(correction =>
    correction.cfr_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
    correction.corrective_action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const years = Array.from({ length: 21 }, (_, i) => 2005 + i);
  const titles = [7, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading corrections...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Regulatory Corrections</h1>
        <p className="mt-2 text-gray-600">
          Browse all corrections made to the Code of Federal Regulations
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {/* Search */}
          <div className="sm:col-span-2">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              id="search"
              placeholder="Search CFR reference or action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Year Filter */}
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              id="year"
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Years</option>
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Title Filter */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              CFR Title
            </label>
            <select
              id="title"
              value={filterTitle}
              onChange={(e) => {
                setFilterTitle(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Titles</option>
              {titles.map(title => (
                <option key={title} value={title}>Title {title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {filteredCorrections.length} corrections
            {(filterYear || filterTitle) && ' (filtered)'}
          </p>
          {(filterYear || filterTitle || searchTerm) && (
            <button
              onClick={() => {
                setFilterYear('');
                setFilterTitle('');
                setSearchTerm('');
                setPage(1);
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Corrections List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="divide-y divide-gray-200">
          {filteredCorrections.map((correction) => (
            <div key={correction.ecfr_id} className="p-6 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      {correction.cfr_reference}
                    </h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Title {correction.title}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {correction.year}
                    </span>
                  </div>
                  
                  <p className="mt-2 text-sm text-gray-600">
                    {correction.corrective_action}
                  </p>

                  <div className="mt-3 flex items-center space-x-6 text-sm text-gray-500">
                    <div className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Error: {new Date(correction.error_occurred).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Corrected: {new Date(correction.error_corrected).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {correction.lag_days} day lag
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <span className="text-sm text-gray-700">
            Page {page}
          </span>

          <button
            onClick={() => setPage(p => p + 1)}
            disabled={corrections.length < ITEMS_PER_PAGE}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900">About Corrections</h3>
        <p className="mt-1 text-sm text-blue-700">
          These corrections represent changes made to the Code of Federal Regulations to fix errors. 
          The lag time indicates how long it took from when the error occurred to when it was corrected.
        </p>
      </div>
    </div>
  );
}
