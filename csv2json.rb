require 'csv'
require 'json'

puts CSV.table(ARGV[0]).map(&:to_hash).to_json
