.DEFAULT_GOAL := build

CONFIGURATION ?= Debug
DERIVED_DATA_PATH ?= .build/Xcode
TEST_DESTINATION ?= platform=iOS Simulator,name=iPhone 18 Pro Max,OS=latest

XCODE_FLAGS = -project Pinto.xcodeproj -scheme Pinto \
	-configuration "$(CONFIGURATION)" -derivedDataPath "$(DERIVED_DATA_PATH)" \
	CODE_SIGNING_ALLOWED=NO
IOS_TEST_FLAGS = -destination '$(TEST_DESTINATION)' \
	-parallel-testing-enabled NO -test-timeouts-enabled YES \
	-maximum-test-execution-time-allowance 120 -only-testing:PintoTests
SWIFT_PATHS = Pinto PintoTests

.PHONY: build test test-ios build-ios-tests test-ios-without-building lint complex format fmt apm_ci apm_audit

build:
	xcodebuild $(XCODE_FLAGS) -destination 'generic/platform=iOS' build

test: test-ios

test-ios:
	xcodebuild $(XCODE_FLAGS) $(IOS_TEST_FLAGS) test

build-ios-tests:
	xcodebuild $(XCODE_FLAGS) $(IOS_TEST_FLAGS) build-for-testing

test-ios-without-building:
	xcodebuild $(XCODE_FLAGS) $(IOS_TEST_FLAGS) test-without-building

lint:
	xcrun swift-format lint --strict --recursive $(SWIFT_PATHS)

complex:
	swiftlint lint --config .swiftlint.yml $(SWIFT_PATHS)

fmt format:
	xcrun swift-format format --in-place --recursive $(SWIFT_PATHS)

apm_ci:
	apm install --policy ./apm-policy.yml --frozen

apm_audit:
	apm audit --ci --policy ./apm-policy.yml
