package com.nextdoorcs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class NextdoorcsApplication {

    public static void main(String[] args) {
        SpringApplication.run(NextdoorcsApplication.class, args);
    }
}
