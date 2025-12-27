'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Picker Scheduler
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Optimize your workforce scheduling with demand-driven automation.
            Match picker staffing to predicted order volume.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Link href="/manager" className="card hover:shadow-lg transition-shadow">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Manager Portal
              </h2>
              <p className="text-gray-600">
                Create and manage schedules, handle time-off requests, and view reports.
              </p>
            </div>
          </Link>

          <Link href="/employee" className="card hover:shadow-lg transition-shadow">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Employee Portal
              </h2>
              <p className="text-gray-600">
                View your schedule, submit availability, and request time off.
              </p>
            </div>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <Link href="/(auth)/login" className="btn-primary">
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
