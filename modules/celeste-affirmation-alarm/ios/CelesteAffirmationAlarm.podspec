Pod::Spec.new do |s|
  s.name             = 'CelesteAffirmationAlarm'
  s.version          = '1.0.0'
  s.summary          = 'On-device affirmation alarms for Celeste.'
  s.description      = 'An Expo module that schedules iOS 26 AlarmKit alarms with locally rendered affirmation audio.'
  s.license          = { :type => 'MIT' }
  s.author           = { 'Celeste' => 'dev@localhost' }
  s.homepage         = 'https://example.invalid/celeste'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { :git => 'https://example.invalid/celeste-affirmation-alarm.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
