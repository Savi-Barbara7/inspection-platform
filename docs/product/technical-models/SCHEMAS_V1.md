# Template Schemas v1 — campos para primeiros modelos

Não criar tabela de banco específica por modelo. Estes são schemas/configuração sobre o mesmo engine.

## NR-13 Caldeira
Identificação: equipment_id, tag, manufacturer, serial_number, manufacture_year, identification_plate_data, boiler_category, boiler_type, site.
Inspeção: inspection_type, inspection_start_date, inspection_end_date, inspection_description, exams_tests, internal_exam_photos, interventions, results.
Constatações: unmet_nr13_items, recommendations, required_actions.
Integridade: integrity_conclusion, next_inspection_date.
Válvulas: opening_pressure, closing_pressure, calibration_certificate_number, calibration_certificate.
Responsáveis: ph_name, ph_professional_registration, ph_signature, participating_technicians.

## PGR
Organização: name, cnpj, unit/site, cnae, risk_grade quando aplicável, responsible_people, issue_date, revision.
Processos: process_name, environment, description, activities, worker_groups.
Inventário: hazard, hazard_type, source, possible_harm, exposed_groups, exposure, existing_controls, monitoring_data, ergonomic_reference, probability_method, severity_method, risk_classification, decision_criteria, evidence.
Plano: risk_reference, action, hierarchy_of_controls, responsible, due_date, priority, status, completion_evidence, effectiveness_review.
Fechamento: methodology, limitations, review_cycle, signatures, documents.

## AET
Demanda: requesting_area, reason, triggering_condition, complaints, health_monitoring_reference, accident_analysis_reference.
Organização/processo: context, process, work_situation, prescribed_task, actual_activity, workers, schedules, pauses, goals.
Métodos: method_name, justification, application, result, attachment.
Análise: physical, cognitive, organizational, biomechanical, furniture/equipment, environmental, observations, photos.
Diagnóstico: diagnosis, factors, findings, severity/priority.
Recomendações: recommendation, priority, responsible, deadline, validation_method.
Restituição/revisão: worker_participation, restitution_date, feedback, changes, validation_result, next_review.
Responsáveis: professional, registration, signature.

## PMOC
Estabelecimento: building_name, cnpj, address, owner/responsible, contacts.
RT: name, registration, ART/document, contacts.
Ambientes: environment_name, area, occupants, use, thermal_load.
Equipamentos: tag, type, manufacturer, model, serial, location, capacity_btu, filter_class, status.
Plano: equipment/group, activity, procedure, frequency, responsible_role, failure_recommendation, emergency_recommendation.
Execução: scheduled_date, performed_date, activity, technician, result, observations, photos, parts, signature.

## PGRS
Empreendimento: name, cnpj, address, activity, period, pgrs_type.
RT: name, council, registration, ART/RRT/TRT, signature.
Resíduos: waste_name, source, classification, physical_state, quantity, unit, frequency, passive, hazard_characteristics.
Gerenciamento: waste_reference, segregation, packaging, identification, storage, collection, transporter, treatment, destination, records.
Responsabilidades: generation, segregation, storage, collection, transport, destination.
Prevenção/correção: scenario, preventive_action, corrective_action, emergency_action, responsible.
Metas: minimization, reuse, recycling, indicators, target_date.

## Avaliação de Imóveis Urbanos
Solicitante: requester, contact.
Trabalho: objective, purpose, reference_date, report_type.
Bem: address, registration, coordinates, property_type, land_area, built_area, age, conservation, construction_standard, occupation, neighborhood, infrastructure.
Documentação: document_type, name, status, observation, file.
Vistoria: date, responsible, access_conditions, characterization, photos.
Mercado/amostras: source, location, asking/transaction_value, area, unit_value, characteristics, adjustments, notes.
Método: method, justification, assumptions, limiting_conditions, treatment, calculation_memory.
Resultado: value, reference_date, classification when applicable, conclusion.
Responsabilidade: professional, registration, signature, ART/RRT.

## Inspeção Predial — draft ABNT
Identificação: requester, building, address, manager, use, age, units, built_area, systems_typology.
Documentos: requested_document, available, analyzed, observations, attachment.
Metodologia: inspection_dates, team, method, limitations, sampling.
Sistemas repeatable: system_name, condition, anomalies, classification, photos, findings, recommendations, priority.
Manutenção: maintenance_management, plans, records, observations.
Conclusão: global_assessment, priority_summary, recommendations, limitations, professional, signature.

## Vistoria Cautelar de Vizinhança — draft ABNT
Obra: project_name, contractor, address, type, planned_start, construction_characteristics, excavation/foundation info, site photos/maps.
Imóvel repeatable: code, address, owner/occupant, contact, relation_to_site, building_type, floors, apparent_age, access_status, inspection_date, participants.
Ambiente repeatable: environment_name, order, elements, description, apparent_state, observed_manifestations, observations, photo_section.
Manifestação repeatable: type, element, location, description, dimensions, photos, notes.
Encerramento: restrictions, unavailable_areas, conclusion, signoff, professional, registration, ART/RRT.
