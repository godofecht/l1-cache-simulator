#include <iostream>

void compiler_info() {
    std::cout << "--- Compiler Information ---" << std::endl;

#if defined(__GNUC__)
    std::cout << "GNU C/C++ Compiler (GCC)" << std::endl;
    std::cout << "Version: " << __GNUC__ << "." << __GNUC_MINOR__ << "." << __GNUC_PATCHLEVEL__ << std::endl;
#elif defined(__clang__)
    std::cout << "Clang Compiler" << std::endl;
    std::cout << "Version: " << __clang_major__ << "." << __clang_minor__ << "." << __clang_patchlevel__ << std::endl;
#elif defined(_MSC_VER)
    std::cout << "Microsoft Visual C++ Compiler" << std::endl;
    std::cout << "Version: " << _MSC_VER << std::endl;
#else
    std::cout << "Unknown Compiler" << std::endl;
#endif

    std::cout << "C++ Standard: ";
#if __cplusplus == 201103L
    std::cout << "C++11" << std::endl;
#elif __cplusplus == 201402L
    std::cout << "C++14" << std::endl;
#elif __cplusplus == 201703L
    std::cout << "C++17" << std::endl;
#elif __cplusplus == 202002L
    std::cout << "C++20" << std::endl;
#else
    std::cout << "Pre-C++11 or unknown" << std::endl;
#endif
    std::cout << "--------------------------" << std::endl;
}

int main() {
    std::cout << "Hello from C++ simulator!" << std::endl;
    compiler_info();
    return 0;
}
